import { Module } from '@nestjs/common';
import { FleetStatusModule } from '../fleet-status/fleet-status.module';
import { FleetEventsService } from './fleet-events.service';
import { InventoryClient } from './inventory.client';

/** Fase D: eventos de flota hacia RabbitMQ (los consume ms-inventario, que envía el stock a Booking). */
@Module({
  imports: [FleetStatusModule],
  providers: [FleetEventsService, InventoryClient],
  exports: [FleetEventsService, InventoryClient],
})
export class FleetEventsModule {}
