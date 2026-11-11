import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { VehicleState } from '../../domain/fleet-state';
import { AdminCallContext } from '../clients/clients.client';
import { FleetEventsService } from '../fleet-events/fleet-events.service';
import { InventoryClient } from '../fleet-events/inventory.client';
import { FleetStatusService } from '../fleet-status/fleet-status.service';
import { BOOKING_PARTNER_SUB } from '../integration-v3/v3-orders.service';
import { MessageBus } from '../messaging/message-bus';

const RECENT_PUSHES = 30;
const RECENT_ORDERS = 20;

/**
 * Monitor de la integración con Booking Prototipo (contrato v3 + inventory.proto) para el panel:
 * configuración efectiva, estado de la flota según la máquina de 6 estados, envío de stock (lo hace ms-inventario
 * a partir de los eventos de flota; se le consulta con el token del admin) y reservas que entraron por Booking.
 * Nunca expone la BOOKING_API_KEY: solo si está configurada.
 */
@Injectable()
export class BookingAdminService {
  constructor(
    private readonly config: ConfigService,
    private readonly fleet: FleetStatusService,
    private readonly fleetEvents: FleetEventsService,
    private readonly inventory: InventoryClient,
    private readonly bus: MessageBus,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async overview(ctx: AdminCallContext, now = new Date()) {
    const authorization = 'authorization' in ctx.credential ? ctx.credential.authorization : '';
    const [units, stock, orders] = await Promise.all([
      this.fleet.list(now),
      this.inventory.overview(authorization, ctx.correlationId),
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
        // Envío de stock: lo hace ms-inventario (null si no respondió)
        stockMode: stock?.mode ?? 'desconocido',
        stockTarget: stock?.target ?? null,
        stockIntervalMs: this.config.get<number>('FLEET_SNAPSHOT_INTERVAL_MS'),
        stockClientActive: stock?.active ?? false,
        apiKeyConfigured: Boolean(this.config.get<string>('BOOKING_API_KEY')),
        inventoryReachable: stock !== null,
        eventBus: {
          mode: this.bus.mode, connected: this.bus.connected, exchange: this.bus.exchange,
          consumerConnected: stock?.broker.connected ?? false, processed: stock?.broker.processed ?? 0,
        },
      },
      fleet: { total: units.length, states },
      sync: { tracked: 0, ok: 0, failing: 0, lastSyncedAt: null, ...stock?.sync, total: units.length },
      pushes: (stock?.pushes ?? []).slice(0, RECENT_PUSHES),
      orders,
    };
  }

  /** Publica ahora el estado de toda la flota (en producción se publica solo cada FLEET_SNAPSHOT_INTERVAL_MS). */
  syncNow(correlationId?: string) {
    return this.fleetEvents.publishSnapshot(correlationId);
  }
}
