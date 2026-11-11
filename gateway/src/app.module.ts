import { DynamicModule, Module } from '@nestjs/common';

import { GatewayConfig } from './config';
import { AdminGuard } from './admin-auth';
import { GATEWAY_CONFIG, HealthController } from './health.controller';
import { MetricsController } from './metrics.controller';

@Module({})
export class AppModule {
  static register(config: GatewayConfig): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController, MetricsController],
      providers: [{ provide: GATEWAY_CONFIG, useValue: config }, AdminGuard],
    };
  }
}
