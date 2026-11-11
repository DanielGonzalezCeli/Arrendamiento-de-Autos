import { INestApplication } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { ClientRequest } from 'http';
import { createProxyMiddleware } from 'http-proxy-middleware';
import pino from 'pino';
import pinoHttp from 'pino-http';

import { GatewayConfig } from './config';
import { clientIp, resolveCorrelationId, sendProblem } from './http-helpers';
import { gatewayDuration, gatewayRequests, rateLimited, upstreamErrors } from './metrics';
import { GATEWAY_PREFIX, isInternalPath, resolveRoute } from './routes';

/** Datos que el gateway calcula una vez por petición y comparten los middlewares. */
interface GatewayRequest extends Request {
  correlationId: string;
  clientIp: string;
  upstream: string | null;
  timedOut?: boolean;
}

/** Campos que nunca deben aparecer en los logs (los mismos que en los microservicios). */
const REDACTED_PATHS = ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-api-key"]'];

/**
 * Cadena de middlewares del gateway (el orden importa):
 *  1. correlación e IP del cliente → 2. métricas → 3. log de acceso → 4. rutas internas bloqueadas →
 *  5. CORS de /gateway/* → 6. límite por IP → 7. proxy al microservicio.
 * Las rutas `/gateway/*` (salud agregada, métricas) no se reenvían: las atiende Nest después de esta cadena.
 */
export function configureGateway(app: INestApplication, config: GatewayConfig): void {
  const server = app.getHttpAdapter().getInstance();
  server.disable('x-powered-by');

  server.use((req: GatewayRequest, res: Response, next: NextFunction) => {
    req.correlationId = resolveCorrelationId(req.headers['x-correlation-id']);
    req.clientIp = clientIp(req, config.trustProxyHops);
    req.upstream = req.path.startsWith(`${GATEWAY_PREFIX}/`) ? null : resolveRoute(req.path)?.service ?? null;
    res.setHeader('X-Correlation-Id', req.correlationId);
    next();
  });

  // Métricas: cada petición, con su destino (el microservicio, "gateway" para /gateway/* o "bloqueada").
  server.use((req: GatewayRequest, res: Response, next: NextFunction) => {
    const stop = gatewayDuration.startTimer();
    res.on('finish', () => {
      const upstream = isInternalPath(req.path) ? 'bloqueada' : req.upstream ?? 'gateway';
      gatewayRequests.inc({ upstream, status: String(res.statusCode) });
      stop({ upstream });
    });
    next();
  });

  server.use(
    pinoHttp({
      logger: pino({ level: config.logLevel, timestamp: pino.stdTimeFunctions.isoTime, redact: REDACTED_PATHS }),
      genReqId: (req) => (req as GatewayRequest).correlationId,
      customProps: (req) => ({ cid: (req as GatewayRequest).correlationId, upstream: (req as GatewayRequest).upstream }),
      customLogLevel: (_req, res, error) => (error || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
      serializers: {
        req: (req) => ({ method: req.method, url: req.url, ip: (req.raw as GatewayRequest).clientIp }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  // Seguridad (fase E): las rutas que los microservicios exponen solo entre sí (/internal/*) y sus /metrics no se
  // publican. Desde Internet responden 404, como si no existieran.
  server.use((req: GatewayRequest, res: Response, next: NextFunction) => {
    if (!isInternalPath(req.path)) return next();
    sendProblem(req, res, 404, 'NOT_FOUND', 'Recurso no encontrado', 'La ruta no existe', req.correlationId);
  });

  // CORS solo para /gateway/* (la página de observabilidad del panel lo llama desde el navegador). Las demás
  // rutas devuelven el CORS de cada microservicio.
  server.use((req: GatewayRequest, res: Response, next: NextFunction) => {
    if (!req.path.startsWith(`${GATEWAY_PREFIX}/`)) return next();
    const origin = req.headers.origin;
    if (origin && config.corsOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, X-Correlation-Id');
      res.setHeader('Access-Control-Expose-Headers', 'X-Correlation-Id');
    }
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  });

  if (config.rateLimitPerMinute > 0) {
    server.use(
      rateLimit({
        windowMs: 60_000,
        limit: config.rateLimitPerMinute,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        keyGenerator: (req) => (req as GatewayRequest).clientIp,
        // La IP ya se resolvió arriba con TRUST_PROXY_HOPS; no hace falta que la librería valide "trust proxy".
        validate: { xForwardedForHeader: false, trustProxy: false },
        skip: (req) => req.path.startsWith(`${GATEWAY_PREFIX}/`),
        handler: (req, res) => {
          const r = req as GatewayRequest;
          rateLimited.inc();
          sendProblem(r, res, 429, 'RATE_LIMITED', 'Demasiadas peticiones',
            `Se superó el límite de ${config.rateLimitPerMinute} peticiones por minuto; intenta de nuevo en unos segundos`, r.correlationId);
        },
      }),
    );
  }

  server.use(
    createProxyMiddleware<GatewayRequest, Response>({
      pathFilter: (_path, req) => req.upstream !== null,
      router: (req) => config.services[req.upstream as string],
      changeOrigin: true,
      proxyTimeout: config.proxyTimeoutMs,
      on: {
        proxyReq: (proxyReq: ClientRequest, req) => {
          // El microservicio ve el mismo X-Correlation-Id y la IP real del cliente (para sus límites y logs).
          proxyReq.setHeader('X-Correlation-Id', req.correlationId);
          proxyReq.setHeader('X-Forwarded-For', req.clientIp);
          proxyReq.setHeader('X-Forwarded-Host', req.headers.host ?? '');
          proxyReq.setHeader('X-Forwarded-Proto', req.protocol);
          proxyReq.on('timeout', () => (req.timedOut = true));
        },
        proxyRes: (_proxyRes, req, res) => {
          res.setHeader('X-Upstream-Service', req.upstream ?? '');
        },
        error: (error, req, res) => {
          if (!('setHeader' in res)) return;
          const r = req as GatewayRequest;
          const service = r.upstream ?? 'desconocido';
          upstreamErrors.inc({ upstream: service, type: r.timedOut ? 'timeout' : 'no_disponible' });
          if (r.timedOut) {
            sendProblem(r, res, 504, 'UPSTREAM_TIMEOUT', 'El servicio no respondió a tiempo',
              `${service} no respondió en ${config.proxyTimeoutMs} ms`, r.correlationId);
          } else {
            sendProblem(r, res, 502, 'UPSTREAM_UNAVAILABLE', 'Servicio no disponible',
              `No se pudo contactar a ${service} (${(error as NodeJS.ErrnoException).code ?? error.message})`, r.correlationId);
          }
        },
      },
    }),
  );
}
