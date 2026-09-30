import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { EventsModule } from '../events/events.module';
import { OrdersModule } from '../orders/orders.module';
import { AdminOperationsService } from './admin-operations.service';
import { AdminController } from './admin.controller';
import { CatalogAdminService } from './catalog-admin.service';
import { DepotAdminService } from './depot-admin.service';
import { FleetAdminService } from './fleet-admin.service';
import { IntegrationAdminService } from './integration-admin.service';

/** Panel de administración (/api/admin). Reutiliza los servicios de dominio (reservas, disponibilidad, eventos). */
@Module({
  imports: [OrdersModule, AvailabilityModule, EventsModule],
  controllers: [AdminController],
  providers: [AdminOperationsService, CatalogAdminService, FleetAdminService, DepotAdminService, IntegrationAdminService],
})
export class AdminModule {}
