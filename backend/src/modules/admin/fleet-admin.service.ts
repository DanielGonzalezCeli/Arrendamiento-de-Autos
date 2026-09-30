import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { DomainError, ProblemCode } from '../../domain/domain-error';
import { RentalStatus, UnitStatus } from '../../domain/enums';
import { AvailabilityService } from '../availability/availability.service';
import { FleetUnit } from '../catalog/entities/fleet-unit.entity';
import { VehicleBlock } from '../catalog/entities/vehicle-block.entity';
import { Reservation } from '../orders/entities/reservation.entity';
import { isUuid } from '../orders/uuid';
import { FleetUnitDto, UpdateFleetUnitDto, VehicleBlockDto } from './dto/admin.dto';

/**
 * Flota física (placas) y bloqueos de disponibilidad. Regla central: el inventario de un modelo en una
 * agencia no puede quedar por debajo de las reservas ya confirmadas. Por eso, antes de retirar una
 * unidad (baja, mantenimiento, cambio de agencia o bloqueo) se comprueba que las reservas sigan cubiertas.
 */
@Injectable()
export class FleetAdminService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly availability: AvailabilityService,
  ) {}

  listUnits(filters: { vehicleModelId?: string; depotId?: number }) {
    return this.dataSource.getRepository(FleetUnit).find({
      where: {
        ...(isUuid(filters.vehicleModelId) ? { vehicleModelId: filters.vehicleModelId } : {}),
        ...(filters.depotId ? { depotId: filters.depotId } : {}),
      },
      relations: { vehicleModel: true, depot: true },
      order: { depotId: 'ASC', plate: 'ASC' },
    });
  }

  createUnit(dto: FleetUnitDto) {
    return this.dataSource.getRepository(FleetUnit).save({ ...dto, active: true });
  }

  async updateUnit(id: string, dto: UpdateFleetUnitDto) {
    return this.dataSource.transaction(async (m) => {
      const unit = await this.lockUnit(m, id);
      const leavesInventory =
        (dto.active === false && unit.active) ||
        (dto.status !== undefined && dto.status !== UnitStatus.Available && unit.status === UnitStatus.Available) ||
        (dto.depotId !== undefined && dto.depotId !== unit.depotId) ||
        (dto.vehicleModelId !== undefined && dto.vehicleModelId !== unit.vehicleModelId);

      if (leavesInventory) {
        await this.assertNotInUse(m, unit);
        await this.assertReservationsStillCovered(m, unit);
      }
      await m.update(FleetUnit, id, dto);
      return m.findOneOrFail(FleetUnit, { where: { id }, relations: { vehicleModel: true, depot: true } });
    });
  }

  listBlocks(unitId: string) {
    if (!isUuid(unitId)) throw DomainError.notFound('La unidad no existe');
    return this.dataSource.getRepository(VehicleBlock).find({ where: { fleetUnitId: unitId }, order: { startsAt: 'DESC' } });
  }

  /** Bloqueo por mantenimiento: la unidad no cuenta como disponible en ese periodo (RN08). */
  async createBlock(unitId: string, dto: VehicleBlockDto, actorUserId: string) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (startsAt >= endsAt) {
      throw DomainError.validation('El bloqueo termina antes de empezar', [{ name: 'endsAt', reason: 'debe ser posterior a startsAt' }]);
    }
    return this.dataSource.transaction(async (m) => {
      const unit = await this.lockUnit(m, unitId);
      await this.availability.lockVehicleModel(m, unit.vehicleModelId);

      const [assigned] = await m.query(
        `SELECT locator FROM reservations WHERE fleet_unit_id = $1 AND status IN ('PENDING','CONFIRMED') AND rental_status <> 'RETURNED'
            AND rental_period && tstzrange($2::timestamptz, $3::timestamptz, '[)') LIMIT 1`,
        [unit.id, startsAt, endsAt],
      );
      if (assigned) throw conflict(`La unidad está entregada en la reserva ${assigned.locator} durante ese periodo`);

      if (unit.active && unit.status === UnitStatus.Available) {
        const free = await this.availability.countAvailableUnits(m, {
          vehicleModelId: unit.vehicleModelId, depotId: unit.depotId, pickupAt: startsAt, dropoffAt: endsAt,
        });
        if (free === 0) throw conflict('Todas las unidades de este modelo en la agencia están comprometidas con reservas en ese periodo');
      }
      return m.save(VehicleBlock, { fleetUnitId: unit.id, startsAt, endsAt, reason: dto.reason, createdBy: actorUserId });
    });
  }

  async deleteBlock(blockId: string) {
    const block = isUuid(blockId) ? await this.dataSource.getRepository(VehicleBlock).findOneBy({ id: blockId }) : null;
    if (!block) throw DomainError.notFound('El bloqueo no existe');
    await this.dataSource.getRepository(VehicleBlock).delete(blockId);
  }

  // ── reglas ────────────────────────────────────────────────────────────────
  private async lockUnit(m: EntityManager, id: string): Promise<FleetUnit> {
    const unit = isUuid(id) ? await m.findOne(FleetUnit, { where: { id }, lock: { mode: 'pessimistic_write' } }) : null;
    if (!unit) throw DomainError.notFound('La unidad no existe');
    return unit;
  }

  /** Un vehículo entregado a un cliente no se puede dar de baja ni mover. */
  private async assertNotInUse(m: EntityManager, unit: FleetUnit) {
    const inUse = await m.findOne(Reservation, { where: { fleetUnitId: unit.id, rentalStatus: RentalStatus.PickedUp } });
    if (inUse) throw conflict(`La unidad está entregada al cliente (reserva ${inUse.locator}); registra primero la devolución`);
  }

  /**
   * Retirar esta unidad del inventario de su modelo/agencia no debe dejar sin auto a ninguna reserva futura:
   * para cada reserva activa, las unidades libres (sin contarla a ella) deben ser ≥ 2 (una para ella y la que se retira).
   */
  private async assertReservationsStillCovered(m: EntityManager, unit: FleetUnit) {
    if (!unit.active || unit.status !== UnitStatus.Available) return; // ya no contaba en el inventario
    await this.availability.lockVehicleModel(m, unit.vehicleModelId);
    const upcoming: Reservation[] = await m.query(
      `SELECT id, locator, pickup_at AS "pickupAt", dropoff_at AS "dropoffAt" FROM reservations
        WHERE vehicle_model_id = $1 AND pickup_depot_id = $2 AND status IN ('PENDING','CONFIRMED')
          AND rental_status = 'NOT_STARTED' AND dropoff_at > now()
        ORDER BY pickup_at`,
      [unit.vehicleModelId, unit.depotId],
    );
    for (const reservation of upcoming) {
      const free = await this.availability.countAvailableUnits(m, {
        vehicleModelId: unit.vehicleModelId, depotId: unit.depotId,
        pickupAt: reservation.pickupAt, dropoffAt: reservation.dropoffAt, excludeReservationId: reservation.id,
      });
      if (free < 2) {
        throw conflict(`Retirar esta unidad dejaría sin vehículo a la reserva ${reservation.locator}; agrega otra unidad del modelo primero`);
      }
    }
  }
}

function conflict(detail: string): DomainError {
  return new DomainError(ProblemCode.ValidationFailed, 409, 'Conflicto', detail);
}
