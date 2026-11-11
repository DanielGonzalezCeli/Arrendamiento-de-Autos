import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { httpMetricsMiddleware } from './common/metrics';
import { correlationMiddleware, ProblemDetailsV3Filter } from './common/problem-details-v3';

/**
 * Configuración HTTP común a main.ts y a los tests. Sin CORS: a este servicio solo lo llaman Booking (servidor a
 * servidor, a través del gateway) y ms-reservas, nunca un navegador.
 */
export function configureApp(app: INestApplication): void {
  const trustProxyHops = app.get(ConfigService).get<number>('TRUST_PROXY_HOPS') ?? 0;
  if (trustProxyHops > 0) app.getHttpAdapter().getInstance().set('trust proxy', trustProxyHops);
  // Antes que el logger: así el id de cada línea de log es el X-Correlation-Id.
  app.use(correlationMiddleware);
  app.use(httpMetricsMiddleware);
  app.use(helmet());
  app.useGlobalFilters(new ProblemDetailsV3Filter());
}
