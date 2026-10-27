import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { v3Error, V3Code } from '../../common/problem-details/problem-details-v3';
import { DomainEventType } from '../events/domain-events';
import { isUuid } from '../orders/uuid';
import { vehicleIdForPlate } from '../fleet-status/fleet-status.service';
import { BOOKING_PARTNER_SUB } from './v3-orders.service';
import { refundIdFor } from './v3-mapper';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const SOURCE = '/microservices/ms-autos';
const EVENT_ID_PREFIX = 'evt-car-';

interface FeedRow {
  id: string;
  event_type: DomainEventType;
  occurred_at: Date;
  locator: string;
  plate: string | null;
  partner_data: Record<string, unknown> | null;
  total_price: string;
  cancellation_fee: string | null;
}

/**
 * GET /autos/eventos — feed del Transactional Outbox como CloudEvents 1.0 (acordado con Booking: sin broker).
 * Paginación por cursor: `after` = id del último evento leído. Solo las órdenes de Booking.
 */
@Injectable()
export class EventsFeedService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async list(limitParam?: string, after?: string) {
    const limit = limitParam === undefined ? DEFAULT_LIMIT : Number(limitParam);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      throw v3Error(400, V3Code.MalformedRequest, 'Parámetro inválido', `limit debe ser un entero de 1 a ${MAX_LIMIT}`,
        [{ name: 'limit', reason: `1 a ${MAX_LIMIT}` }]);
    }
    const cursor = after?.startsWith(EVENT_ID_PREFIX) ? after.slice(EVENT_ID_PREFIX.length) : after;
    if (cursor !== undefined && !isUuid(cursor)) {
      throw v3Error(400, V3Code.MalformedRequest, 'Parámetro inválido', 'after debe ser el id de un evento del feed', [{ name: 'after', reason: 'id inválido' }]);
    }

    const rows: FeedRow[] = await this.dataSource.query(
      `SELECT o.id, o.event_type, o.occurred_at, r.locator, r.vehicle_snapshot->>'plate' AS plate, r.partner_data,
              r.total_price, r.cancellation_fee
         FROM outbox_events o
         JOIN reservations r ON r.id::text = o.resource_id
        WHERE r.owner_sub = $1 AND o.event_type = ANY($2)
          AND ($3::uuid IS NULL OR (o.occurred_at, o.id) > (SELECT occurred_at, id FROM outbox_events WHERE id = $3::uuid))
        ORDER BY o.occurred_at, o.id
        LIMIT $4`,
      [BOOKING_PARTNER_SUB, [DomainEventType.CarOrderConfirmed, DomainEventType.CarOrderCancelled], cursor ?? null, limit],
    );
    const events = rows.map(toCloudEvent);
    return {
      events,
      metadata: { total: events.length, next_cursor: events[events.length - 1]?.id ?? after ?? null, timestamp: new Date().toISOString() },
    };
  }
}

function toCloudEvent(row: FeedRow) {
  const autoId = row.plate ? vehicleIdForPlate(row.plate) : null;
  const confirmed = row.event_type === DomainEventType.CarOrderConfirmed;
  const total = Number(row.total_price);
  const fee = Number(row.cancellation_fee ?? 0);
  return {
    specversion: '1.0',
    type: `ec.edu.epn.booking.autos.order.${confirmed ? 'confirmed' : 'cancelled'}`,
    source: SOURCE,
    id: `${EVENT_ID_PREFIX}${row.id}`,
    time: new Date(row.occurred_at).toISOString(),
    correlation_id: (row.partner_data?.correlation_id as string | undefined) ?? `corr-${row.id.slice(0, 8)}`,
    datacontenttype: 'application/json',
    data: confirmed
      ? { order_id: row.locator, pnr: row.locator, auto_id: autoId, total_price: total, nuevo_estado_auto: 'RESERVADO' }
      : {
          order_id: row.locator, pnr: row.locator, auto_id: autoId, refund_id: refundIdFor(row.locator),
          refund_amount: Math.round((total - fee) * 100) / 100, estado_restituido: 'DISPONIBLE',
        },
  };
}
