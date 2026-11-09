import { INestApplication } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { ClientRequest } from 'http';
import { createProxyMiddleware } from 'http-proxy-middleware';
import pino from 'pino';
import pinoHttp from 'pino-http';

import { GatewayConfig } from './config';
import { clientIp, resolveCorrelationId, sendProblem } from './http-helpers';
import { GATEWAY_PREFIX, resolveRoute } from './routes';

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
 *  1. correlación e IP del cliente → 2. log de acceso → 3. límite por IP → 4. proxy al microservicio.
 * Las rutas `/gateway/*` (salud agregada) no se reenvían: las atiende Nest después de esta cadena.
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
