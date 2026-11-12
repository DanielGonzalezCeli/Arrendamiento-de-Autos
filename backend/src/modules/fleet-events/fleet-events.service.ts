import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { newCorrelationId } from '../../common/problem-details/problem-details-v3';
import { FleetStatusService, vehicleIdForPlate } from '../fleet-status/fleet-status.service';
import { Reservation } from '../orders/entities/reservation.entity';
import { MessageBus } from '../messaging/message-bus';
import { vehicleStock } from './fleet-stock';

/** Routing keys y tipos (CloudEvents) de los eventos de flota. ms-inventario escucha flota.*. */
export const FLEET_EVENTS = {
  changed: { routingKey: 'flota.estado_cambiado', type: 'ec.rutalibre.flota.estado_cambiado' },
  snapshot: { routingKey: 'flota.snapshot', type: 'ec.rutalibre.flota.snapshot' },
} as const;

/**
 * Fase D: ms-reservas ya no envía el stock a Booking; publica el estado de la flota en RabbitMQ y ms-inventario
 * se encarga del envío. Dos eventos:
 * - flota.estado_cambiado: al reservar por Booking o al cancelar (Booking, web o panel), solo ese auto (aviso inmediato, con el
 *   X-Correlation-Id de la operación que lo causó).
 * - flota.snapshot: toda la flota cada FLEET_SNAPSHOT_INTERVAL_MS (30 s). Cubre lo demás (reservas web, entregas,
 *   devoluciones, fin del cooldown, taller) y repara cualquier evento perdido: ms-inventario solo envía cambios.
 */
@Injectable()
export class FleetEventsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(FleetEventsService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly fleet: FleetStatusService,
    private readonly bus: MessageBus,
  ) {}

  onApplicationBootstrap(): void {
    const interval = this.config.get<number>('FLEET_SNAPSHOT_INTERVAL_MS') ?? 30_000;
    if (interval > 0) {
      this.timer = setInterval(() => void this.publishSnapshot(), interval);
      this.timer.unref();
    }
    void this.publishSnapshot();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Aviso inmediato de un auto. Nunca lanza (si falla, lo cubre el próximo snapshot). */
  async vehicleChanged(vehicleId: string, correlationId = newCorrelationId()): Promise<void> {
    try {
      const now = new Date();
      const unit = await this.fleet.findByVehicleId(vehicleId, now);
      if (!unit) return;
      const vehicles = [vehicleStock(unit, now, unit.depot.timezone)];
      await this.bus.publish(FLEET_EVENTS.changed.routingKey, FLEET_EVENTS.changed.type, { vehicles }, correlationId);
    } catch (error) {
      this.logger.warn(`Evento de ${vehicleId} pendiente: ${(error as Error).message}`);
    }
  }

  /**
   * Aviso inmediato tras cambiar una reserva (p. ej. al cancelarla, su auto vuelve a DISPONIBLE). Las reservas de
   * Booking tienen placa; las de la web reservan un modelo (la placa se asigna en la recogida), así que se publica
   * el snapshot de la flota en lugar de esperar al temporizador. Nunca lanza.
   */
  reservationChanged(reservation: Reservation, correlationId?: string): void {
    const plate = reservation.vehicleSnapshot?.plate;
    if (typeof plate === 'string') void this.vehicleChanged(vehicleIdForPlate(plate), correlationId);
    else void this.publishSnapshot(correlationId);
  }

  /** Publica el estado de toda la flota. Lo usan el temporizador y el botón "Sincronizar stock ahora" del panel. */
  async publishSnapshot(correlationId = newCorrelationId()): Promise<{ checked: number; published: boolean }> {
    try {
      const now = new Date();
      const units = await this.fleet.list(now);
      const vehicles = units.map((unit) => vehicleStock(unit, now, unit.depot.timezone));
      const published = await this.bus.publish(FLEET_EVENTS.snapshot.routingKey, FLEET_EVENTS.snapshot.type, { vehicles }, correlationId);
      return { checked: vehicles.length, published };
    } catch (error) {
      this.logger.warn(`No se pudo publicar el snapshot de la flota: ${(error as Error).message}`);
      return { checked: 0, published: false };
    }
  }
}
