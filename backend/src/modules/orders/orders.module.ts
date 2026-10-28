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
import { ChargeSettingsService } from './charge-settings.service';
import { RentalChargeSettings } from './entities/rental-charge-settings.entity';
import { RentalInspection } from './entities/rental-inspection.entity';
import { RentalOperationsService } from './rental-operations.service';
import { ReservationService } from './reservation.service';
import { InvoicesModule } from '../invoices/invoices.module';

/** Dominio de órdenes: hold, preview y reservas. Compartido por la API interna y la de integración. */
@Module({
  imports: [
    TypeOrmModule.forFeature([Hold, OrderPreview, Reservation, ReservationExtra, ReservationHistory, RentalInspection, RentalChargeSettings]),
    CatalogModule,
    SearchModule,
    AvailabilityModule,
    EventsModule,
    InvoicesModule,
  ],
  providers: [HoldService, OrderPreviewService, OrderPricingService, ReservationService, RentalOperationsService, ChargeSettingsService],
  exports: [HoldService, OrderPreviewService, ReservationService, RentalOperationsService, ChargeSettingsService],
})
export class OrdersModule {}
