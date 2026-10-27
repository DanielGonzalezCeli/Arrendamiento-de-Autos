import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FleetStatusModule } from '../fleet-status/fleet-status.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { OrdersModule } from '../orders/orders.module';
import { StockSyncModule } from '../stock-sync/stock-sync.module';
import { ApiKeyGuard } from './api-key.guard';
import { CorrelationMiddleware } from './correlation.middleware';
import { PromotionAgreement } from './entities/promotion-agreement.entity';
import { EventsFeedService } from './events-feed.service';
import { IntegrationV3Controller } from './integration-v3.controller';
import { PromotionsService } from './promotions.service';
import { V3CatalogService } from './v3-catalog.service';
import { V3OrdersService } from './v3-orders.service';

/**
 * Reto 2 — integración con Booking Prototipo por el contrato v3 (/api/v3) y el inventory.proto (gRPC).
 * Por ahora vive en el monolito y reutiliza los servicios de dominio; al separar los microservicios
 * (acuerdo del equipo de Autos) cada servicio de aquí pasa a su microservicio.
 */
@Module({
  imports: [TypeOrmModule.forFeature([PromotionAgreement]), OrdersModule, IdempotencyModule, FleetStatusModule, StockSyncModule],
  controllers: [IntegrationV3Controller],
  providers: [V3CatalogService, V3OrdersService, PromotionsService, EventsFeedService, ApiKeyGuard, CorrelationMiddleware],
})
export class IntegrationV3Module implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes({ path: 'api/v3/*', method: RequestMethod.ALL }, { path: 'api/v3', method: RequestMethod.ALL });
  }
}
