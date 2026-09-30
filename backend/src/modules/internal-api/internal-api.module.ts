import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { OrdersModule } from '../orders/orders.module';
import { SearchModule } from '../search/search.module';
import { CheckoutController } from './checkout.controller';
import { PublicCatalogController } from './public-catalog.controller';

/** API interna (/api) para el frontend: reutiliza los mismos servicios de dominio que la API de integración. */
@Module({
  imports: [CatalogModule, SearchModule, OrdersModule, IdempotencyModule],
  controllers: [PublicCatalogController, CheckoutController],
})
export class InternalApiModule {}
