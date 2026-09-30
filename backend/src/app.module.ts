import { randomUUID } from 'crypto';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RouterModule } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';

import { validateEnv } from './config/env.validation';
import { buildTypeOrmOptions } from './config/typeorm.config';
import { AuthModule } from './modules/auth/auth.module';
import { AvailabilityModule } from './modules/availability/availability.module';
import { INTEGRATION_BASE_PATH } from './modules/docs/contract-docs';
import { INTERNAL_BASE_PATH } from './modules/docs/internal-docs';
import { HealthModule } from './modules/health/health.module';
import { IntegrationApiModule } from './modules/integration-api/integration-api.module';

/** Campos que nunca deben aparecer en los logs. */
const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.password',
  'req.body.client_secret',
  'req.body.secret',
];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env', validate: validateEnv }),

    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL') ?? 'info',
          redact: REDACTED_PATHS,
          // Correlación: se respeta el X-Request-Id entrante o se genera uno.
          genReqId: (req, res) => {
            const id = (req.headers['x-request-id'] as string) || randomUUID();
            res.setHeader('X-Request-Id', id);
            return id;
          },
          transport:
            config.get('NODE_ENV') === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        ...buildTypeOrmOptions(config.getOrThrow<string>('DATABASE_URL')),
        autoLoadEntities: true,
      }),
    }),

    HealthModule,
    AvailabilityModule,
    AuthModule,
    IntegrationApiModule,
    // /api/*       → API interna (frontend)       · /autos/v1/* → API de integración (Booking Hub)
    RouterModule.register([
      { path: INTERNAL_BASE_PATH, module: AuthModule },
      { path: INTEGRATION_BASE_PATH, module: IntegrationApiModule },
    ]),
  ],
})
export class AppModule {}
