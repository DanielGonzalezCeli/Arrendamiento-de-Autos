import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { DomainEventType } from './domain-events';
import { OutboxEvent } from './entities/outbox-event.entity';

/**
 * Transactional Outbox: el evento se inserta con el MISMO EntityManager que el cambio de negocio,
 * así ambos se confirman o se revierten juntos. El despacho (webhooks) ocurre después, en otro proceso
 * (WebhookDispatcher, Fase 12), con garantía de al menos una entrega.
 */
@Injectable()
export class OutboxService {
  async record(
    manager: EntityManager, eventType: DomainEventType, resourceId: string, payload: Record<string, unknown>,
  ): Promise<OutboxEvent> {
    return manager.save(OutboxEvent, manager.create(OutboxEvent, { eventType, resourceId, payload }));
  }
}
