import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';

/** Métricas Prometheus del gateway (fase E). Todas llevan service="gateway". */
export const metrics = new Registry();
metrics.setDefaultLabels({ service: 'gateway' });
collectDefaultMetrics({ register: metrics });

/** upstream = microservicio al que se reenvió ("gateway" para las rutas propias, "bloqueada" para /internal y /metrics). */
export const gatewayRequests = new Counter({
  name: 'gateway_requests_total',
  help: 'Peticiones que atendió el gateway, por microservicio de destino y código de estado',
  labelNames: ['upstream', 'status'],
  registers: [metrics],
});

export const gatewayDuration = new Histogram({
  name: 'gateway_request_duration_seconds',
  help: 'Tiempo total de respuesta visto por el cliente (incluye al microservicio), por destino',
  labelNames: ['upstream'],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
  registers: [metrics],
});

export const upstreamErrors = new Counter({
  name: 'gateway_upstream_errors_total',
  help: 'Microservicio caído (502) o lento (504), por destino',
  labelNames: ['upstream', 'type'],
  registers: [metrics],
});

export const rateLimited = new Counter({
  name: 'gateway_rate_limited_total',
  help: 'Peticiones rechazadas con 429 por superar el límite por IP',
  registers: [metrics],
});
