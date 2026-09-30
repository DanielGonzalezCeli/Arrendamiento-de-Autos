import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DomainError } from '../../domain/domain-error';
import { DeliveryStatus } from '../../domain/enums';
import { WebhookDelivery } from '../events/entities/webhook-delivery.entity';
import { WebhookDispatcherService } from '../events/webhook-dispatcher.service';
import { isUuid } from '../orders/uuid';

const RECENT_DELIVERIES = 50;

/**
 * Monitor de integración (EDA/SOA) para el panel: clientes OAuth2 del Hub, suscripciones y entregas de
 * webhooks, con reintento manual y ejecución inmediata del dispatcher (útil en la demo de la defensa).
 * Nunca expone secretos (hash del cliente ni secret de las suscripciones).
 */
@Injectable()
export class IntegrationAdminService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly dispatcher: WebhookDispatcherService,
  ) {}

  async overview() {
    const [clients, subscriptions, deliveries, [outbox]] = await Promise.all([
      this.dataSource.query(`
        SELECT client_id AS "clientId", name, scopes, affiliate_id AS "affiliateId", active, created_at AS "createdAt"
          FROM api_clients ORDER BY created_at`),
      this.dataSource.query(`
        SELECT s.id, s.owner_sub AS "ownerSub", s.url, s.events, s.active, s.created_at AS "createdAt",
               count(d.id) FILTER (WHERE d.status = 'SUCCEEDED')::int AS delivered,
               count(d.id) FILTER (WHERE d.status IN ('FAILED', 'DEAD'))::int AS failed
          FROM webhook_subscriptions s LEFT JOIN webhook_deliveries d ON d.subscription_id = s.id
         GROUP BY s.id ORDER BY s.created_at DESC`),
      this.dataSource.query(`
        SELECT d.id, d.status, d.attempt, d.response_code AS "responseCode", d.last_error AS "lastError",
               d.next_attempt_at AS "nextAttemptAt", d.delivered_at AS "deliveredAt", d.created_at AS "createdAt",
               e.event_type AS "eventType", e.resource_id AS "resourceId", s.url
          FROM webhook_deliveries d
          JOIN outbox_events e ON e.id = d.event_id
          JOIN webhook_subscriptions s ON s.id = d.subscription_id
         ORDER BY d.created_at DESC LIMIT $1`, [RECENT_DELIVERIES]),
      this.dataSource.query(`
        SELECT count(*) FILTER (WHERE dispatched_at IS NULL)::int AS pending, count(*)::int AS total FROM outbox_events`),
    ]);
    return { clients, subscriptions, deliveries, outbox };
  }

  /** Reprograma una entrega fallida o muerta para el próximo ciclo (sin esperar el backoff). */
  async retryDelivery(id: string) {
    const repo = this.dataSource.getRepository(WebhookDelivery);
    const delivery = isUuid(id) ? await repo.findOneBy({ id }) : null;
    if (!delivery) throw DomainError.notFound('La entrega no existe');
    if (delivery.status === DeliveryStatus.Succeeded) {
      throw DomainError.validation('La entrega ya fue exitosa', [{ name: 'id', reason: 'SUCCEEDED' }]);
    }
    await repo.update(id, { status: DeliveryStatus.Pending, nextAttemptAt: new Date(), attempt: delivery.status === DeliveryStatus.Dead ? 0 : delivery.attempt });
    return this.dispatcher.runOnce();
  }

  /** Ejecuta un ciclo del dispatcher ahora (en producción corre solo cada 10 s). */
  dispatchNow() {
    return this.dispatcher.runOnce();
  }
}
