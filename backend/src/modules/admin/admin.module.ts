import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { EventsModule } from '../events/events.module';
import { FleetStatusModule } from '../fleet-status/fleet-status.module';
import { MediaModule } from '../media/media.module';
import { OrdersModule } from '../orders/orders.module';
import { StockSyncModule } from '../stock-sync/stock-sync.module';
import { AdminOperationsService } from './admin-operations.service';
import { AdminController } from './admin.controller';
import { BookingAdminService } from './booking-admin.service';
import { CatalogAdminService } from './catalog-admin.service';
import { DepotAdminService } from './depot-admin.service';
import { FleetAdminService } from './fleet-admin.service';
import { IntegrationAdminService } from './integration-admin.service';
import { VouchersModule } from '../vouchers/vouchers.module';

/** Panel de administración (/api/admin). Reutiliza los servicios de dominio (reservas, disponibilidad, eventos). */
@Module({
  imports: [OrdersModule, AvailabilityModule, EventsModule, MediaModule, FleetStatusModule, StockSyncModule, VouchersModule],
  controllers: [AdminController],
  providers: [AdminOperationsService, CatalogAdminService, FleetAdminService, DepotAdminService, IntegrationAdminService, BookingAdminService],
})
export class AdminModule {}
