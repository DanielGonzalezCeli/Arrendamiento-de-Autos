import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import { stdTimeFunctions } from 'pino';

import { ClientsInternalController, ClientsV3Controller } from './clientes/clients.controller';
import { ClientsService } from './clientes/clients.service';
import { ApiKeyGuard, Credentials, ServiceGuard } from './common/auth.guards';
import { MetricsController } from './common/metrics';
import { validateEnv } from './config/env.validation';
import { buildTypeOrmOptions } from './config/typeorm.config';
import { HealthController } from './health/health.controller';

/** Campos que nunca deben aparecer en los logs (credenciales y datos personales del cuerpo). */
const REDACTED_PATHS = ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-api-key"]'];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env', validate: validateEnv }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL') ?? 'info',
          timestamp: stdTimeFunctions.isoTime,
          redact: REDACTED_PATHS,
          // Traza distribuida: el X-Correlation-Id que fija correlationMiddleware (del gateway o de ms-reservas).
          genReqId: (req) => req.headers['x-correlation-id'] as string,
          customProps: () => ({ service: 'ms-clientes' }),
        },
      }),
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ ...buildTypeOrmOptions(config.getOrThrow<string>('DATABASE_URL')), autoLoadEntities: true }),
    }),
  ],
  controllers: [ClientsV3Controller, ClientsInternalController, HealthController, MetricsController],
  providers: [ClientsService, Credentials, ApiKeyGuard, ServiceGuard],
})
export class AppModule {}
