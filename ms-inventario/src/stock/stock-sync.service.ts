import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { Counter } from 'prom-client';
import { DataSource } from 'typeorm';
import { metrics } from '../common/metrics';
import { BookingStockTransport, GrpcStockTransport, HttpStockTransport, resolveProtoPath } from './booking-stock.client';
import { StockSyncLog } from './entities/stock-sync-log.entity';
import { StockSyncState } from './entities/stock-sync-state.entity';
import { needsPush, nextTimestamp, slotId, StockUpdateAck, StockUpdateMessage, VehicleStock } from './stock-message';

export interface ApplySummary {
  checked: number;
  pushed: number;
  failed: number;
  stale: number;
}

/** Acuses que significan "Booking ya tiene este estado o uno más nuevo": no se reintenta. */
const SETTLED_CODES = new Set(['OK', 'STALE_TIMESTAMP_IGNORED']);
const RECENT_PUSHES = 50;

const pushes = new Counter({
  name: 'booking_stock_push_total',
  help: 'PushStockUpdate enviados a Booking, por transporte y resultado (confirmado o fallido)',
  labelNames: ['transport', 'result'],
  registers: [metrics],
});

/**
 * Envío de stock a Booking (inventory.proto · PushStockUpdate) a partir de los eventos de flota de ms-reservas.
 * Compara lo que dice cada evento con lo último que Booking confirmó y solo envía los cambios; un envío fallido se
 * reintenta con el siguiente snapshot (cada 30 s), sin acoplarse a ningún flujo de ms-reservas.
 */
@Injectable()
export class StockSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StockSyncService.name);
  private transport: BookingStockTransport | null = null;
  /** Los eventos se aplican de a uno (además de prefetch 1 en la cola), para no enviar dos veces el mismo cambio. */
  private queue: Promise<unknown> = Promise.resolve();
  private lastFailure: string | null = null;
  readonly mode: 'off' | 'grpc' | 'http';
  readonly target: string | null;

  constructor(
    private readonly config: ConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {
    this.mode = config.get<'off' | 'grpc' | 'http'>('STOCK_SYNC_MODE') ?? 'off';
    this.target = this.mode === 'grpc' ? config.get<string>('BOOKING_GRPC_TARGET')! : this.mode === 'http' ? config.get<string>('BOOKING_STOCK_HTTP_URL')! : null;
  }

  onModuleInit(): void {
    if (this.mode === 'off') {
      this.logger.log('Envío de stock a Booking desactivado (STOCK_SYNC_MODE=off): los eventos se registran pero no se envían');
      return;
    }
    try {
      this.transport = this.mode === 'grpc'
        ? new GrpcStockTransport(this.target!, resolveProtoPath(this.config.get('INVENTORY_PROTO_PATH')))
        : new HttpStockTransport(this.target!, this.config.get<string>('BOOKING_API_KEY'));
      this.logger.log(`Envío de stock a Booking por ${this.mode} → ${this.target}`);
    } catch (error) {
      this.logger.error(`No se pudo iniciar el cliente de stock (${this.mode}): ${(error as Error).message}`);
    }
  }

  onModuleDestroy(): void {
    this.transport?.close();
  }

  get active(): boolean {
    return this.transport !== null;
  }

  /** Aplica un evento de flota (cambio de un auto o snapshot de toda la flota). Nunca procesa dos a la vez. */
  apply(vehicles: VehicleStock[], eventTime: Date, correlationId: string): Promise<ApplySummary> {
    const run = this.queue.then(() => this.reconcile(vehicles, eventTime, correlationId));
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Resumen para el panel /admin/booking (vía ms-reservas). */
  async overview() {
    const [[sync], pushes] = await Promise.all([
      this.dataSource.query(`
        SELECT count(*)::int AS tracked,
               count(*) FILTER (WHERE last_success)::int AS ok,
               count(*) FILTER (WHERE last_success = false)::int AS failing,
               max(synced_at) AS "lastSyncedAt"
          FROM inventario.stock_sync_state`),
      this.dataSource.query(`
        SELECT id, item_id AS "itemId", transport, success, error_code AS "errorCode", message,
               payload->>'available_units' AS "availableUnits", payload->>'date' AS date,
               payload->>'time_slot' AS "timeSlot", created_at AS "createdAt"
          FROM inventario.stock_sync_log ORDER BY created_at DESC LIMIT $1`, [RECENT_PUSHES]),
    ]);
    return { mode: this.mode, target: this.target, active: this.active, sync, pushes };
  }

  private async reconcile(vehicles: VehicleStock[], eventTime: Date, correlationId: string): Promise<ApplySummary> {
    const summary: ApplySummary = { checked: 0, pushed: 0, failed: 0, stale: 0 };
    this.lastFailure = null;
    const repo = this.dataSource.getRepository(StockSyncState);
    const stateById = new Map((await repo.find()).map((s) => [s.itemId, s]));

    for (const vehicle of vehicles) {
      summary.checked++;
      const synced = stateById.get(vehicle.vehicle_id);
      if (synced?.lastEventAt && synced.lastEventAt > eventTime) {
        summary.stale++;
        continue;
      }
      const pending = needsPush(vehicle, { units: synced?.syncedUnits ?? null, date: synced?.syncedDate ?? null, timeSlot: synced?.syncedTimeSlot ?? null });
      if (!pending || !this.transport) {
        await repo.upsert({ itemId: vehicle.vehicle_id, lastEventAt: eventTime }, ['itemId']);
        continue;
      }
      const ok = await this.push({
        service_id: this.config.get<string>('NODE_ID')!,
        item_id: vehicle.vehicle_id,
        date: vehicle.date,
        time_slot: vehicle.time_slot,
        available_units: vehicle.available_units,
        timestamp: nextTimestamp(Number(synced?.lastTimestamp ?? 0), Date.now()),
        slot_id: slotId(vehicle.date, vehicle.time_slot),
      }, synced, eventTime, correlationId);
      if (ok) summary.pushed++;
      else summary.failed++;
    }
    if (summary.pushed || summary.failed) {
      const reason = summary.failed && this.lastFailure ? ` — último error: ${this.lastFailure}` : '';
      const scope = summary.checked === 1 ? vehicles[0].vehicle_id : `${summary.checked} autos`;
      this.logger.log(`Stock → Booking: ${summary.pushed} enviados, ${summary.failed} con error (${scope})${reason} cid=${correlationId}`);
    }
    return summary;
  }

  private async push(message: StockUpdateMessage, previous: StockSyncState | undefined, eventTime: Date, correlationId: string): Promise<boolean> {
    const transport = this.transport!;
    let ack: StockUpdateAck | null = null;
    let failure: string | null = null;
    try {
      ack = await transport.push(message, correlationId);
    } catch (error) {
      failure = (error as Error).message.slice(0, 300);
    }
    const errorCode = ack?.error_code || (ack?.success ? 'OK' : failure ? 'TRANSPORT_ERROR' : 'REJECTED');
    const settled = !!ack && (ack.success || SETTLED_CODES.has(errorCode));
    const text = (failure ?? ack?.message ?? null)?.slice(0, 300) ?? null;

    await this.dataSource.getRepository(StockSyncLog).save({
      itemId: message.item_id, transport: transport.name, payload: message as unknown as Record<string, unknown>, success: settled, errorCode, message: text,
    });
    await this.dataSource.getRepository(StockSyncState).save({
      itemId: message.item_id,
      lastTimestamp: String(message.timestamp),
      lastSuccess: settled,
      lastErrorCode: errorCode,
      lastMessage: text,
      attempts: settled ? 0 : (previous?.attempts ?? 0) + 1,
      lastEventAt: eventTime,
      ...(settled
        ? { syncedUnits: message.available_units, syncedDate: message.date, syncedTimeSlot: message.time_slot, syncedAt: new Date() }
        : {}),
    });
    pushes.inc({ transport: transport.name, result: settled ? 'confirmado' : 'fallido' });
    if (!settled) this.lastFailure = `${errorCode}${text ? `: ${text}` : ''}`;
    if (!settled && (previous?.attempts ?? 0) === 0) {
      this.logger.warn(`PushStockUpdate ${message.item_id} falló (${errorCode}): ${text ?? ''} — se reintentará con el siguiente snapshot`);
    }
    return settled;
  }
}
