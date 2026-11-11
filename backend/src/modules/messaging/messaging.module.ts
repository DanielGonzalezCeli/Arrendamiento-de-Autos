import { Global, Module } from '@nestjs/common';
import { MessageBus } from './message-bus';

/** Fase D: publicación de eventos de dominio en RabbitMQ (global: cualquier módulo puede publicar). */
@Global()
@Module({
  providers: [MessageBus],
  exports: [MessageBus],
})
export class MessagingModule {}
