import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { VehicleState } from '../../domain/fleet-state';
import { FleetStatusService } from '../fleet-status/fleet-status.service';
import { BOOKING_PARTNER_SUB } from '../integration-v3/v3-orders.service';
import { StockSyncService } from '../stock-sync/stock-sync.service';

const RECENT_PUSHES = 30;
const RECENT_ORDERS = 20;

/**
 * Monitor de la integración con Booking Prototipo (contrato v3 + inventory.proto) para el panel:
 * configuración efectiva, estado de la flota según la máquina de 6 estados, reconciliación de stock
 * (último acuse por auto y bitácora de PushStockUpdate) y reservas que entraron por Booking.
 * Nunca expone la BOOKING_API_KEY: solo si está configurada.
 */
@Injectable()
export class BookingAdminService {
  constructor(
    private readonly config: ConfigService,
    private readonly fleet: FleetStatusService,
    private readonly stockSync: StockSyncService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async overview(now = new Date()) {
    const mode = this.config.get<'off' | 'grpc' | 'http'>('STOCK_SYNC_MODE')!;
    const [units, [sync], pushes, orders] = await Promise.all([
      this.fleet.list(now),
      this.dataSource.query(`
        SELECT count(*)::int AS tracked,
               count(*) FILTER (WHERE last_success)::int AS ok,
               count(*) FILTER (WHERE last_success = false)::int AS failing,
               max(synced_at) AS "lastSyncedAt"
          FROM stock_sync_state`),
      this.dataSource.query(`
        SELECT id, item_id AS "itemId", transport, success, error_code AS "errorCode", message,
               payload->>'available_units' AS "availableUnits", payload->>'date' AS date,
               payload->>'time_slot' AS "timeSlot", created_at AS "createdAt"
          FROM stock_sync_log ORDER BY created_at DESC LIMIT $1`, [RECENT_PUSHES]),
      this.dataSource.query(`
        SELECT r.id, r.locator, r.status, r.rental_status AS "rentalStatus", r.pickup_at AS "pickupAt",
               r.dropoff_at AS "dropoffAt", r.total_price::float AS "totalPrice", r.currency,
               r.driver_first_name || ' ' || r.driver_last_name AS driver,
               r.vehicle_snapshot->>'display_name' AS vehicle, u.plate, r.created_at AS "createdAt"
          FROM reservations r LEFT JOIN fleet_units u ON u.id = r.fleet_unit_id
         WHERE r.owner_sub = $1 ORDER BY r.created_at DESC LIMIT $2`, [BOOKING_PARTNER_SUB, RECENT_ORDERS]),
    ]);

    const states = Object.fromEntries(Object.values(VehicleState).map((s) => [s, 0])) as Record<VehicleState, number>;
    for (const unit of units) states[unit.state]++;

    return {
      config: {
        nodeId: this.config.get<string>('NODE_ID'),
        partnerName: this.config.get<string>('PARTNER_NAME'),
        stockMode: mode,
        stockTarget: mode === 'grpc' ? this.config.get<string>('BOOKING_GRPC_TARGET') : mode === 'http' ? this.config.get<string>('BOOKING_STOCK_HTTP_URL') : null,
        stockIntervalMs: this.config.get<number>('STOCK_SYNC_INTERVAL_MS'),
        stockClientActive: this.stockSync.enabled,
        apiKeyConfigured: Boolean(this.config.get<string>('BOOKING_API_KEY')),
      },
      fleet: { total: units.length, states },
      sync: { ...sync, total: units.length },
      pushes,
      orders,
    };
  }

  /** Ejecuta una vuelta de reconciliación ahora (en producción corre sola cada STOCK_SYNC_INTERVAL_MS). */
  syncNow() {
    return this.stockSync.syncAll();
  }
}
