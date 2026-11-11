import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { httpMetricsMiddleware } from './common/metrics';
import { ProblemDetailsFilter, validationExceptionFactory } from './common/problem-details';

/** Configuración HTTP común a main.ts y a los tests. */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);

  // Detrás del API Gateway: req.ip (límite de intentos de login) es la IP del cliente, no la del gateway.
  const trustProxyHops = config.get<number>('TRUST_PROXY_HOPS') ?? 0;
  if (trustProxyHops > 0) app.getHttpAdapter().getInstance().set('trust proxy', trustProxyHops);

  app.use(httpMetricsMiddleware);
  app.use(helmet());
  // El gateway reenvía tal cual las peticiones del navegador (incluido el preflight): CORS lo responde cada servicio.
  app.enableCors({
    origin: config.get<string>('CORS_ORIGINS')!.split(',').map((o) => o.trim()),
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Correlation-Id'],
    exposedHeaders: ['X-Request-Id', 'Retry-After', 'X-Correlation-Id'],
  });
  // whitelist: descarta propiedades no declaradas (p. ej. "role" en el registro: RN27).
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, exceptionFactory: validationExceptionFactory }));
  app.useGlobalFilters(new ProblemDetailsFilter());
}
