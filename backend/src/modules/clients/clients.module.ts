import { Module } from '@nestjs/common';
import { ClientsClient } from './clients.client';

/** Fase C: acceso a ms-clientes (dueño de los clientes cross-platform del contrato v3.1). */
@Module({
  providers: [ClientsClient],
  exports: [ClientsClient],
})
export class ClientsModule {}
