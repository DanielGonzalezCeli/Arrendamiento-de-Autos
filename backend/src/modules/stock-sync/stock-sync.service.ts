import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { FleetStatusService, FleetUnitView } from '../fleet-status/fleet-status.service';
import { BookingStockTransport, GrpcStockTransport, HttpStockTransport, resolveProtoPath } from './booking-stock.client';
import { StockSyncLog } from './entities/stock-sync-log.entity';
import { StockSyncState } from './entities/stock-sync-state.entity';
import { desiredStock, needsPush, nextTimestamp, slotId, StockUpdateAck, StockUpdateMessage } from './stock-message';

export interface SyncSummary {
  checked: number;
  pushed: number;
  failed: number;
}

/** Acuses que significan "Booking ya tiene este estado o uno más nuevo": no se reintenta. */
const SETTLED_CODES = new Set(['OK', 'STALE_TIMESTAMP_IGNORED']);

/**
 * Sincronización de stock con Booking (inventory.proto · PushStockUpdate). Patrón "reconciliación":
 * compara el estado de cada auto con el último que Booking confirmó y envía solo los cambios. Así cubre
 * reservas, cancelaciones, entregas, devoluciones, fin del cooldown y taller, sin acoplarse a cada flujo;
 * un envío fallido se reintenta en la siguiente vuelta.
 */
@Injectable()
export class StockSyncService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(StockSyncService.name);
  private transport: BookingStockTransport | null = null;
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<SyncSummary> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly fleet: FleetStatusService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  onApplicationBootstrap(): void {
    const mode = this.config.get<'off' | 'grpc' | 'http'>('STOCK_SYNC_MODE');
    if (mode === 'off') {
      this.logger.log('Sincronización de stock con Booking desactivada (STOCK_SYNC_MODE=off)');
      return;
    }
    try {
      this.transport = mode === 'grpc'
        ? new GrpcStockTransport(this.config.get<string>('BOOKING_GRPC_TARGET')!, resolveProtoPath(this.config.get('INVENTORY_PROTO_PATH')))
        : new HttpStockTransport(this.config.get<string>('BOOKING_STOCK_HTTP_URL')!);
    } catch (error) {
      this.logger.error(`No se pudo iniciar el cliente de stock (${mode}): ${(error as Error).message}`);
      return;
    }
    const target = mode === 'grpc' ? this.config.get('BOOKING_GRPC_TARGET') : this.config.get('BOOKING_STOCK_HTTP_URL');
    this.logger.log(`Sincronización de stock con Booking por ${mode} → ${target}`);

    const interval = this.config.get<number>('STOCK_SYNC_INTERVAL_MS')!;
    if (interval > 0) {
      this.timer = setInterval(() => void this.syncAll(), interval);
      this.timer.unref();
    }
    void this.syncAll();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.transport?.close();
  }

  get enabled(): boolean {
    return this.transport !== null;
  }

  /** Reconciliación de toda la flota. Si ya hay una vuelta en curso, se reutiliza (no se envía dos veces). */
  syncAll(now = new Date()): Promise<SyncSummary> {
    if (!this.transport) return Promise.resolve({ checked: 0, pushed: 0, failed: 0 });
    if (!this.running) {
      this.running = this.reconcile(this.fleet.list(now), now).finally(() => (this.running = null));
    }
    return this.running;
  }

  /** Aviso inmediato tras reservar o cancelar (sin esperar a la siguiente vuelta). Nunca lanza. */
  async syncVehicle(vehicleId: string): Promise<void> {
    if (!this.transport) return;
    try {
      const now = new Date();
      const unit = await this.fleet.findByVehicleId(vehicleId, now);
      if (unit) await this.reconcile(Promise.resolve([unit]), now);
    } catch (error) {
      this.logger.warn(`Sincronización de ${vehicleId} pendiente: ${(error as Error).message}`);
    }
  }

  private async reconcile(unitsPromise: Promise<FleetUnitView[]>, now: Date): Promise<SyncSummary> {
    const summary: SyncSummary = { checked: 0, pushed: 0, failed: 0 };
    let units: FleetUnitView[];
    try {
      units = await unitsPromise;
    } catch (error) {
      this.logger.warn(`No se pudo leer la flota para sincronizar: ${(error as Error).message}`);
      return summary;
    }
    const states = await this.dataSource.getRepository(StockSyncState).find();
    const stateById = new Map(states.map((s) => [s.itemId, s]));

    for (const unit of units) {
      summary.checked++;
      const desired = desiredStock(unit, now, unit.depot.timezone);
      const synced = stateById.get(desired.itemId);
      if (!needsPush(desired, { units: synced?.syncedUnits ?? null, date: synced?.syncedDate ?? null, timeSlot: synced?.syncedTimeSlot ?? null })) {
        continue;
      }
      const ok = await this.push(desired.itemId, {
        service_id: this.config.get<string>('NODE_ID')!,
        item_id: desired.itemId,
        date: desired.date,
        time_slot: desired.timeSlot,
        available_units: desired.units,
        timestamp: nextTimestamp(Number(synced?.lastTimestamp ?? 0), Date.now()),
        slot_id: slotId(desired.date, desired.timeSlot),
      }, synced);
      if (ok) summary.pushed++;
      else summary.failed++;
    }
    if (summary.pushed || summary.failed) {
      this.logger.log(`Stock → Booking: ${summary.pushed} enviados, ${summary.failed} con error (de ${summary.checked} autos)`);
    }
    return summary;
  }

  private async push(itemId: string, message: StockUpdateMessage, previous: StockSyncState | undefined): Promise<boolean> {
    const transport = this.transport!;
    let ack: StockUpdateAck | null = null;
    let failure: string | null = null;
    try {
      ack = await transport.push(message);
    } catch (error) {
      failure = (error as Error).message.slice(0, 300);
    }
    const errorCode = ack?.error_code || (ack?.success ? 'OK' : failure ? 'TRANSPORT_ERROR' : 'REJECTED');
    const settled = !!ack && (ack.success || SETTLED_CODES.has(errorCode));
    const text = (failure ?? ack?.message ?? null)?.slice(0, 300) ?? null;

    await this.dataSource.getRepository(StockSyncLog).insert({
      itemId, transport: transport.name, payload: message as unknown as Record<string, unknown>, success: settled, errorCode, message: text,
    });
    await this.dataSource.getRepository(StockSyncState).save({
      itemId,
      lastTimestamp: String(message.timestamp),
      lastSuccess: settled,
      lastErrorCode: errorCode,
      lastMessage: text,
      attempts: settled ? 0 : (previous?.attempts ?? 0) + 1,
      ...(settled
        ? { syncedUnits: message.available_units, syncedDate: message.date, syncedTimeSlot: message.time_slot, syncedAt: new Date() }
        : {}),
    });
    if (!settled && (previous?.attempts ?? 0) === 0) {
      this.logger.warn(`PushStockUpdate ${itemId} falló (${errorCode}): ${text ?? ''} — se reintentará`);
    }
    return settled;
  }
}
