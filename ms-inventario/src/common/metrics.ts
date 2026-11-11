import { Controller, Get, Header } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';

/**
 * Métricas Prometheus del servicio (fase E). Cada línea lleva service="ms-inventario", así se distinguen al juntarlas.
 * GET /metrics no se publica en Internet: el gateway lo bloquea y solo lo expone a un ADMIN en
 * /gateway/metrics/ms-inventario.
 */
export const metrics = new Registry();
metrics.setDefaultLabels({ service: 'ms-inventario' });
collectDefaultMetrics({ register: metrics });

const httpRequests = new Counter({
  name: 'http_requests_total',
  help: 'Peticiones HTTP atendidas, por método, ruta y código de estado',
  labelNames: ['method', 'route', 'status'],
  registers: [metrics],
});

const httpDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Tiempo de respuesta HTTP en segundos, por método, ruta y código de estado',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metrics],
});

/**
 * Cuenta cada petición con la PLANTILLA de la ruta (/api/v3/orders/:orderId/cancel), no con la URL concreta: así la
 * cantidad de series no crece con cada id. Lo que no coincide con ninguna ruta se agrupa como "no_encontrada".
 */
export function httpMetricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.path === '/metrics') return next();
  const stop = httpDuration.startTimer();
  res.on('finish', () => {
    const template = (req.route as { path?: string } | undefined)?.path;
    const labels = { method: req.method, route: template ? `${req.baseUrl}${template}` : 'no_encontrada', status: String(res.statusCode) };
    httpRequests.inc(labels);
    stop(labels);
  });
  next();
}

@Controller('metrics')
export class MetricsController {
  @Get()
  @Header('Content-Type', metrics.contentType)
  @Header('Cache-Control', 'no-store')
  scrape(): Promise<string> {
    return metrics.metrics();
  }
}
