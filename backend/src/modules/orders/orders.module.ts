import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AvailabilityModule } from '../availability/availability.module';
import { CatalogModule } from '../catalog/catalog.module';
import { EventsModule } from '../events/events.module';
import { SearchModule } from '../search/search.module';
import { Hold } from './entities/hold.entity';
import { OrderPreview } from './entities/order-preview.entity';
import { ReservationExtra } from './entities/reservation-extra.entity';
import { ReservationHistory } from './entities/reservation-history.entity';
import { Reservation } from './entities/reservation.entity';
import { HoldService } from './hold.service';
import { OrderPreviewService } from './order-preview.service';
import { OrderPricingService } from './order-pricing.service';
import { ReservationService } from './reservation.service';

/** Dominio de órdenes: hold, preview y reservas. Compartido por la API interna y la de integración. */
@Module({
  imports: [
    TypeOrmModule.forFeature([Hold, OrderPreview, Reservation, ReservationExtra, ReservationHistory]),
    CatalogModule,
    SearchModule,
    AvailabilityModule,
    EventsModule,
  ],
  providers: [HoldService, OrderPreviewService, OrderPricingService, ReservationService],
  exports: [HoldService, OrderPreviewService, ReservationService],
})
export class OrdersModule {}
