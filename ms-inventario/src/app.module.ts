import { randomUUID } from 'crypto';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import { stdTimeFunctions } from 'pino';

import { AdminGuard } from './common/admin.guard';
import { validateEnv } from './config/env.validation';
import { buildTypeOrmOptions } from './config/typeorm.config';
import { HealthController } from './health/health.controller';
import { FleetEventsConsumer } from './messaging/fleet-events.consumer';
import { StockController } from './stock/stock.controller';
import { StockSyncService } from './stock/stock-sync.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env', validate: validateEnv }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL') ?? 'info',
          timestamp: stdTimeFunctions.isoTime,
          redact: ['req.headers.authorization', 'req.headers.cookie'],
          genReqId: (req, res) => {
            const id = (req.headers['x-correlation-id'] as string) || `cid-inv-${randomUUID().slice(0, 8)}`;
            res.setHeader('X-Correlation-Id', id);
            return id;
          },
          customProps: () => ({ service: 'ms-inventario' }),
        },
      }),
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ ...buildTypeOrmOptions(config.getOrThrow<string>('DATABASE_URL')), autoLoadEntities: true }),
    }),
  ],
  controllers: [StockController, HealthController],
  providers: [StockSyncService, FleetEventsConsumer, AdminGuard],
})
export class AppModule {}
