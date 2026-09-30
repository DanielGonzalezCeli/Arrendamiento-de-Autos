import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { BUSINESS_RULES } from '../../domain/business-rules';
import { DomainError, ProblemCode } from '../../domain/domain-error';
import { OrderStatus, RentalStatus, UnitStatus } from '../../domain/enums';
import { FleetUnit } from '../catalog/entities/fleet-unit.entity';
import { isUuid } from './uuid';
import { ReservationAction, ReservationHistory } from './entities/reservation-history.entity';
import { Reservation } from './entities/reservation.entity';

const PG_EXCLUSION_VIOLATION = '23P01';

export interface PickupInput {
  /** Placa elegida por el agente; si no se indica, se asigna la primera libre del modelo en la agencia. */
  fleetUnitId?: string;
}

export interface ReturnInput {
  /** Kilometraje al devolver (no puede ser menor que el registrado). */
  mileage?: number;
}

/**
 * RN25 — operación en mostrador (panel de administración):
 *  - Entrega: el cliente reservó un MODELO; aquí se asigna una unidad física (placa) libre de ese modelo
 *    en la agencia de recogida. La BD impide asignar una placa a dos alquileres solapados (EXCLUDE).
 *  - Devolución: el alquiler termina y la unidad queda en la agencia de devolución (one-way incluido).
 * No cambian el `status` del contrato (sigue CONFIRMED); cambian el estado operativo `rental_status`.
 */
@Injectable()
export class RentalOperationsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async pickUp(reservationId: string, input: PickupInput, actorSub: string): Promise<Reservation> {
    try {
      return await this.dataSource.transaction(async (m) => {
        const reservation = await this.lock(m, reservationId);
        if (reservation.status !== OrderStatus.Confirmed || reservation.rentalStatus !== RentalStatus.NotStarted) {
          throw conflict('Solo se puede entregar una reserva confirmada que aún no se ha entregado');
        }
        const unit = input.fleetUnitId
          ? await this.validUnit(m, reservation, input.fleetUnitId)
          : await this.firstFreeUnit(m, reservation);

        const before = { rental_status: reservation.rentalStatus };
        await m.update(Reservation, reservation.id, {
          fleetUnitId: unit.id,
          rentalStatus: RentalStatus.PickedUp,
          vehicleSnapshot: { ...reservation.vehicleSnapshot, plate: unit.plate },
          version: reservation.version + 1,
        });
        await this.history(m, reservation.id, ReservationAction.PickedUp, actorSub, before, { rental_status: RentalStatus.PickedUp, plate: unit.plate });
        return m.findOneOrFail(Reservation, { where: { id: reservation.id }, relations: { extras: true } });
      });
    } catch (error) {
      // Defensa en profundidad: dos entregas simultáneas de la misma placa → la BD rechaza la segunda.
      if (error instanceof QueryFailedError && (error as QueryFailedError & { code?: string }).code === PG_EXCLUSION_VIOLATION) {
        throw conflict('Esa placa ya está asignada a otro alquiler en esas fechas');
      }
      throw error;
    }
  }

  async return(reservationId: string, input: ReturnInput, actorSub: string): Promise<Reservation> {
    return this.dataSource.transaction(async (m) => {
      const reservation = await this.lock(m, reservationId);
      if (reservation.rentalStatus !== RentalStatus.PickedUp || !reservation.fleetUnitId) {
        throw conflict('Solo se puede registrar la devolución de un vehículo entregado');
      }
      const unit = await m.findOneOrFail(FleetUnit, { where: { id: reservation.fleetUnitId }, lock: { mode: 'pessimistic_write' } });
      if (input.mileage !== undefined && input.mileage < unit.mileage) {
        throw DomainError.validation(`El kilometraje no puede ser menor que el registrado (${unit.mileage} km)`, [
          { name: 'mileage', reason: `mínimo ${unit.mileage}` },
        ]);
      }

      // La unidad queda donde se devolvió (en un one-way cambia de agencia).
      await m.update(FleetUnit, unit.id, { depotId: reservation.dropoffDepotId, mileage: input.mileage ?? unit.mileage });
      await m.update(Reservation, reservation.id, { rentalStatus: RentalStatus.Returned, version: reservation.version + 1 });
      await this.history(m, reservation.id, ReservationAction.Returned, actorSub,
        { rental_status: RentalStatus.PickedUp }, { rental_status: RentalStatus.Returned, mileage: input.mileage ?? unit.mileage });
      return m.findOneOrFail(Reservation, { where: { id: reservation.id }, relations: { extras: true } });
    });
  }

  /** Unidades que el agente puede elegir para una reserva (para el selector del panel). */
  freeUnits(reservation: Reservation, manager: EntityManager = this.dataSource.manager): Promise<FleetUnit[]> {
    return manager.query(
      `SELECT fu.id, fu.plate, fu.color, fu.year, fu.mileage
         FROM fleet_units fu
        WHERE fu.vehicle_model_id = $1 AND fu.depot_id = $2 AND fu.active AND fu.status = $5
          AND NOT EXISTS (SELECT 1 FROM vehicle_blocks b
                           WHERE b.fleet_unit_id = fu.id AND b.period && tstzrange($3::timestamptz, $4::timestamptz + make_interval(mins => $6), '[)'))
          AND NOT EXISTS (SELECT 1 FROM reservations r
                           WHERE r.fleet_unit_id = fu.id AND r.id <> $7::uuid AND r.status IN ('PENDING', 'CONFIRMED')
                             AND r.rental_status <> 'RETURNED'
                             AND r.rental_period && tstzrange($3::timestamptz, $4::timestamptz, '[)'))
        ORDER BY fu.mileage, fu.plate`,
      [reservation.vehicleModelId, reservation.pickupDepotId, reservation.pickupAt, reservation.dropoffAt,
        UnitStatus.Available, BUSINESS_RULES.CLEANING_BUFFER_MINUTES, reservation.id],
    );
  }

  private async lock(m: EntityManager, id: string): Promise<Reservation> {
    const reservation = isUuid(id) ? await m.findOne(Reservation, { where: { id }, lock: { mode: 'pessimistic_write' } }) : null;
    if (!reservation) throw DomainError.notFound('La reserva no existe');
    return reservation;
  }

  private async firstFreeUnit(m: EntityManager, reservation: Reservation): Promise<FleetUnit> {
    const [unit] = await this.freeUnits(reservation, m);
    if (!unit) throw DomainError.conflict(ProblemCode.CarNoLongerAvailable, 'Sin unidades libres', 'No hay placas libres de este modelo en la agencia de recogida');
    return unit;
  }

  private async validUnit(m: EntityManager, reservation: Reservation, fleetUnitId: string): Promise<FleetUnit> {
    const free = await this.freeUnits(reservation, m);
    const unit = free.find((u) => u.id === fleetUnitId);
    if (!unit) {
      throw DomainError.validation('La placa elegida no está libre o no corresponde al modelo y agencia de la reserva', [
        { name: 'fleetUnitId', reason: 'no disponible' },
      ]);
    }
    return unit;
  }

  private history(m: EntityManager, reservationId: string, action: ReservationAction, actorSub: string,
    before: Record<string, unknown>, after: Record<string, unknown>) {
    return m.save(ReservationHistory, { reservationId, action, actorSub, before, after });
  }
}

function conflict(detail: string): DomainError {
  return new DomainError(ProblemCode.ValidationFailed, 409, 'Conflicto', detail);
}
