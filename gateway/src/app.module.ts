import { DynamicModule, Module } from '@nestjs/common';

import { GatewayConfig } from './config';
import { GATEWAY_CONFIG, HealthController } from './health.controller';

@Module({})
export class AppModule {
  static register(config: GatewayConfig): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController],
      providers: [{ provide: GATEWAY_CONFIG, useValue: config }],
    };
  }
}
