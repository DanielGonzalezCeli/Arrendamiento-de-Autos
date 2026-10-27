import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { FleetStatusService } from './fleet-status.service';

/** Estado de 6 fases de cada auto concreto. Lo usan la API v3 y la sincronización de stock con Booking. */
@Module({
  imports: [CatalogModule],
  providers: [FleetStatusService],
  exports: [FleetStatusService],
})
export class FleetStatusModule {}
