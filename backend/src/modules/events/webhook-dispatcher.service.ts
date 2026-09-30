import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { DeliveryStatus } from '../../domain/enums';
import {
  nextAttemptAt, SIGNATURE_HEADER, signPayload, WEBHOOK_MAX_ATTEMPTS, WEBHOOK_TIMEOUT_MS, webhookUrlProblem,
} from '../../domain/webhook-rules';
import { DomainEventType, WEBHOOK_EVENT_TYPES } from './domain-events';
import { OutboxEvent } from './entities/outbox-event.entity';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import { WebhookSubscription } from './entities/webhook-subscription.entity';
import { WebhookSubscriptionService } from './webhook-subscription.service';

/** Cuántos eventos/entregas procesa cada ciclo. */
const BATCH_SIZE = 20;
/** Mientras se envía una entrega queda "reservada" este tiempo (si el proceso muere, otra instancia la retoma). */
const DELIVERY_LEASE_SECONDS = 60;
const ORDER_EVENTS = new Set<string>([DomainEventType.CarOrderConfirmed, DomainEventType.CarOrderCancelled]);

export interface DispatchReport {
  eventsProcessed: number;
  deliveriesAttempted: number;
  delivered: number;
  failed: number;
}

/**
 * Entrega de eventos por webhook (EDA). Dos pasos, cada N segundos:
 *  1. fan-out: cada evento pendiente del outbox genera una entrega por suscripción interesada;
 *  2. envío: POST firmado (X-Hub-Signature-256) con el WebhookPayload del contrato, con reintentos.
 * Garantía: al menos una entrega. El receptor deduplica por eventId.
 * Usa FOR UPDATE SKIP LOCKED: varias instancias pueden ejecutarlo sin procesar dos veces lo mismo.
 */
@Injectable()
export class WebhookDispatcherService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(WebhookDispatcherService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly subscriptions: WebhookSubscriptionService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    const intervalMs = Number(this.config.get('WEBHOOK_DISPATCH_INTERVAL_MS') ?? 10_000);
    if (intervalMs > 0) this.timer = setInterval(() => void this.tick(), intervalMs);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Un ciclo completo. Público para poder ejecutarlo a demanda (tests, demo). */
  async runOnce(): Promise<DispatchReport> {
    const eventsProcessed = await this.fanOut();
    const { attempted, delivered, failed } = await this.deliverDue();
    return { eventsProcessed, deliveriesAttempted: attempted, delivered, failed };
  }

  private async tick(): Promise<void> {
    if (this.running) return; // no solapar ciclos
    this.running = true;
    try {
      await this.runOnce();
    } catch (error) {
      this.logger.error(`Ciclo de webhooks fallido: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  // ── Paso 1: outbox → entregas ────────────────────────────────────────────────

  private fanOut(): Promise<number> {
    return this.dataSource.transaction(async (m) => {
      const events: OutboxEvent[] = await m.query(
        `SELECT id, event_type AS "eventType", resource_id AS "resourceId"
           FROM outbox_events WHERE dispatched_at IS NULL
          ORDER BY occurred_at LIMIT $1 FOR UPDATE SKIP LOCKED`,
        [BATCH_SIZE],
      );
      for (const event of events) {
        const recipients = await this.recipientsFor(m, event);
        if (recipients.length) {
          await m.createQueryBuilder().insert().into(WebhookDelivery)
            .values(recipients.map((s) => ({ eventId: event.id, subscriptionId: s.id })))
            .orIgnore() // UNIQUE(event_id, subscription_id): idempotente
            .execute();
        }
        await m.update(OutboxEvent, event.id, { dispatchedAt: new Date() });
      }
      return events.length;
    });
  }

  /**
   * Quién recibe un evento. Los eventos de órdenes solo van al dueño de la orden (una reserva web
   * nunca se notifica al Hub, ni la de un sistema a otro). DEPOT_UPDATE es catálogo público: a todos.
   * Eventos internos que no están en el enum del contrato (ej. CAR_ORDER_MODIFIED) no se entregan.
   */
  private async recipientsFor(m: EntityManager, event: OutboxEvent): Promise<WebhookSubscription[]> {
    if (!(WEBHOOK_EVENT_TYPES as readonly string[]).includes(event.eventType)) return [];
    const params: unknown[] = [event.eventType];
    let ownerFilter = '';
    if (ORDER_EVENTS.has(event.eventType)) {
      const [order] = await m.query(`SELECT owner_sub FROM reservations WHERE id::text = $1`, [event.resourceId]);
      if (!order) return [];
      params.push(order.owner_sub);
      ownerFilter = 'AND owner_sub = $2';
    }
    return m.query(`SELECT id FROM webhook_subscriptions WHERE active AND $1 = ANY(events) ${ownerFilter}`, params);
  }

  // ── Paso 2: envío con reintentos ─────────────────────────────────────────────

  private async deliverDue() {
    // Reserva atómica de entregas vencidas (lease) para no enviar dos veces la misma en paralelo.
    // Se usa now() de PostgreSQL (no la hora de la app): las entregas se crean con el reloj de la BD.
    const [due]: [Array<{ id: string }>] = await this.dataSource.query(
      `UPDATE webhook_deliveries SET next_attempt_at = now() + make_interval(secs => $1)
        WHERE id IN (
          SELECT id FROM webhook_deliveries
           WHERE status IN ('PENDING', 'FAILED') AND next_attempt_at <= now()
           ORDER BY next_attempt_at LIMIT $2 FOR UPDATE SKIP LOCKED)
        RETURNING id`,
      [DELIVERY_LEASE_SECONDS, BATCH_SIZE],
    );

    let delivered = 0;
    let failed = 0;
    for (const { id } of due) {
      (await this.deliver(id)) ? delivered++ : failed++;
    }
    return { attempted: due.length, delivered, failed };
  }

  private async deliver(deliveryId: string): Promise<boolean> {
    const repo = this.dataSource.getRepository(WebhookDelivery);
    const delivery = await repo.findOneByOrFail({ id: deliveryId });
    const [event, subscription] = await Promise.all([
      this.dataSource.getRepository(OutboxEvent).findOneByOrFail({ id: delivery.eventId }),
      this.dataSource.getRepository(WebhookSubscription).findOneBy({ id: delivery.subscriptionId }),
    ]);
    const attempt = delivery.attempt + 1;

    if (!subscription?.active) {
      await repo.update(deliveryId, { status: DeliveryStatus.Dead, attempt, lastError: 'Suscripción inactiva' });
      return false;
    }

    // WebhookPayload del contrato (eventId, eventType, timestamp, resourceId requeridos; data opcional).
    const body = JSON.stringify({
      eventId: event.id,
      eventType: event.eventType,
      timestamp: new Date(event.occurredAt).toISOString(),
      resourceId: event.resourceId,
      data: event.payload,
    });

    let responseCode: number | null = null;
    let error: string | null = null;
    try {
      const urlProblem = webhookUrlProblem(subscription.url, this.config.get('NODE_ENV') !== 'production');
      if (urlProblem) throw new Error(urlProblem);
      const response = await fetch(subscription.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'RutaLibre-Webhooks/1.0',
          [SIGNATURE_HEADER]: signPayload(body, this.subscriptions.revealSecret(subscription)),
          'X-Webhook-Event-Id': event.id,
          'X-Webhook-Event-Type': event.eventType,
        },
        body,
        redirect: 'manual', // una redirección no cuenta como entrega (evita saltos a hosts internos)
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      });
      responseCode = response.status;
      if (response.status < 200 || response.status >= 300) error = `HTTP ${response.status}`;
    } catch (e) {
      error = (e as Error).message;
    }

    if (!error) {
      await repo.update(deliveryId, { status: DeliveryStatus.Succeeded, attempt, responseCode, lastError: null, deliveredAt: new Date() });
      this.logger.log(`webhook.delivered event=${event.eventType} id=${event.id} → ${subscription.url}`);
      return true;
    }

    const retryAt = attempt < WEBHOOK_MAX_ATTEMPTS ? nextAttemptAt(attempt, new Date()) : null;
    await repo.update(deliveryId, {
      status: retryAt ? DeliveryStatus.Failed : DeliveryStatus.Dead,
      attempt,
      responseCode,
      lastError: error.slice(0, 500),
      ...(retryAt ? { nextAttemptAt: retryAt } : {}),
    });
    this.logger.warn(`webhook.failed event=${event.eventType} intento=${attempt} → ${subscription.url}: ${error}`);
    return false;
  }
}
