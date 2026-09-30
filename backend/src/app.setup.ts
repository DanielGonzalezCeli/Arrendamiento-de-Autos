import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';

import { validationExceptionFactory } from './common/problem-details/problem-details';
import { ProblemDetailsFilter } from './common/problem-details/problem-details.filter';
import { AuthModule } from './modules/auth/auth.module';
import { resolveContractPath, setupContractDocs } from './modules/docs/contract-docs';
import { setupInternalDocs } from './modules/docs/internal-docs';

/** Configuración HTTP común a main.ts y a los tests, para probar la app tal como corre en producción. */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // Redoc se carga desde jsDelivr y usa web workers (blob:).
          scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
          workerSrc: ["'self'", 'blob:'],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
    }),
  );

  app.enableCors({
    origin: config.get<string>('CORS_ORIGINS').split(',').map((o) => o.trim()),
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Affiliate-Id', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'Retry-After'],
  });

  // whitelist: descarta propiedades no declaradas. forbidNonWhitelisted=false (lector tolerante):
  // el contrato no prohíbe campos adicionales en los requests (ver ANALISIS_CONTRATO.md D7).
  // Los errores de validación salen como ProblemDetails con invalidParams.
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false, exceptionFactory: validationExceptionFactory }),
  );
  app.useGlobalFilters(new ProblemDetailsFilter());

  setupContractDocs(app, resolveContractPath(config.get('CONTRACT_PATH')), config.get('PUBLIC_BASE_URL'));
  setupInternalDocs(app, [AuthModule]);
}
