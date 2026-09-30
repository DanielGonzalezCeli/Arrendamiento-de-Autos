import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { BUSINESS_RULES } from '../../domain/business-rules';

export interface AvailabilityQuery {
  vehicleModelId: string;
  depotId: number;
  pickupAt: Date;
  dropoffAt: Date;
  /** Al modificar una reserva, no contarla contra sí misma. */
  excludeReservationId?: string;
  /** Al confirmar desde un hold propio, no contar ese hold. */
  excludeHoldId?: string;
}

/**
 * RN08 — disponibilidad por inventario (vehicle_id = modelo comercial):
 *   unidades AVAILABLE del modelo en la agencia sin bloqueo en el periodo
 *   − reservas activas que se solapan − holds vigentes que se solapan.
 * El periodo se amplía con el margen de limpieza entre alquileres.
 *
 * Recibe el EntityManager para participar en la transacción del llamador (hold/create/modify).
 */
@Injectable()
export class AvailabilityService {
  async countAvailableUnits(manager: EntityManager, query: AvailabilityQuery): Promise<number> {
    const [row] = await manager.query(
      `WITH req AS (
         SELECT tstzrange($3::timestamptz - make_interval(mins => $5), $4::timestamptz + make_interval(mins => $5), '[)') AS period
       )
       SELECT
         (SELECT count(*) FROM fleet_units fu, req
           WHERE fu.vehicle_model_id = $1 AND fu.depot_id = $2 AND fu.active AND fu.status = 'AVAILABLE'
             AND NOT EXISTS (SELECT 1 FROM vehicle_blocks b WHERE b.fleet_unit_id = fu.id AND b.period && req.period))
       - (SELECT count(*) FROM reservations r, req
           WHERE r.vehicle_model_id = $1 AND r.pickup_depot_id = $2
             AND r.status IN ('PENDING', 'CONFIRMED') AND r.rental_status <> 'RETURNED'
             AND r.rental_period && req.period
             AND ($6::uuid IS NULL OR r.id <> $6::uuid))
       - (SELECT count(*) FROM holds h, req
           WHERE h.vehicle_model_id = $1 AND h.pickup_depot_id = $2
             AND h.status = 'HELD' AND h.expires_at > now()
             AND h.period && req.period
             AND ($7::uuid IS NULL OR h.id <> $7::uuid))
         AS available`,
      [
        query.vehicleModelId,
        query.depotId,
        query.pickupAt,
        query.dropoffAt,
        BUSINESS_RULES.CLEANING_BUFFER_MINUTES,
        query.excludeReservationId ?? null,
        query.excludeHoldId ?? null,
      ],
    );
    return Math.max(0, Number(row.available));
  }

  /**
   * RN10 — serializa las operaciones que consumen inventario de un modelo: dos transacciones
   * concurrentes sobre el mismo modelo esperan su turno, así el recuento nunca queda obsoleto.
   */
  async lockVehicleModel(manager: EntityManager, vehicleModelId: string): Promise<void> {
    await manager.query(`SELECT id FROM vehicle_models WHERE id = $1 FOR UPDATE`, [vehicleModelId]);
  }
}
