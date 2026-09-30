import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { OrdersModule } from '../orders/orders.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { SearchModule } from '../search/search.module';
import { CatalogController } from './catalog.controller';
import { DeprecationHeaderInterceptor } from './deprecation-header.interceptor';
import { OrdersController } from './orders.controller';
import { WebhooksController } from './webhooks.controller';

/**
 * API de integración con Booking Hub (/autos/v1). Implementa contracts/autos-openapi.yaml.
 * Solo contiene la capa HTTP + mappers: las reglas viven en los servicios de dominio compartidos
 * con la API interna (SearchService, ReservationService…).
 */
@Module({
  imports: [CatalogModule, SearchModule, ReviewsModule, OrdersModule, IdempotencyModule],
  controllers: [CatalogController, OrdersController, WebhooksController],
  providers: [DeprecationHeaderInterceptor],
})
export class IntegrationApiModule {}
