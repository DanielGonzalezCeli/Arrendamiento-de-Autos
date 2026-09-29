import { Module } from '@nestjs/common';
import { AutosController } from './autos.controller';
import { AutosService } from './autos.service';

/**
 * API de integración con Booking Hub. Implementa contracts/autos-openapi.yaml y se monta en /autos/v1.
 * Fase 1: stubs heredados de la plantilla oficial. Se conectan a los servicios de dominio en la Fase 9.
 */
@Module({
  controllers: [AutosController],
  providers: [AutosService],
})
export class IntegrationApiModule {}
