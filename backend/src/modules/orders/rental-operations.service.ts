import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { BUSINESS_RULES } from '../../domain/business-rules';
import { DomainError, ProblemCode } from '../../domain/domain-error';
import { FuelPolicy, OrderStatus, RentalStatus, UnitStatus } from '../../domain/enums';
import { FleetUnit } from '../catalog/entities/fleet-unit.entity';
import { isUuid } from './uuid';
import { ReservationAction, ReservationHistory } from './entities/reservation-history.entity';
import { Reservation } from './entities/reservation.entity';
import { occupiedPeriodSql } from '../availability/availability.service';
import { VehicleModel } from '../catalog/entities/vehicle-model.entity';
import { InvoiceService } from '../invoices/invoice.service';
import { nextMaintenanceKm } from '../../domain/fleet-state';
import {
  Cleanliness, computeReturnCharges, Damage, FuelGrade, ReturnChargeResult, TANK_EIGHTHS,
} from '../../domain/return-charges';
import { ChargeSettingsService } from './charge-settings.service';
import { InspectionKind, RentalInspection } from './entities/rental-inspection.entity';

const PG_EXCLUSION_VIOLATION = '23P01';
/** Extra de cobertura total: el cliente no paga daños (RN28). */
const FULL_COVERAGE_EXTRA = 'CDW';

export interface InspectionInput {
  /** Nivel de combustible en octavos de tanque (0 = vacío, 8 = lleno). Por defecto, lleno. */
  fuelEighths?: number;
  /** Odómetro (no puede ser menor que el registrado). Por defecto, el actual de la unidad. */
  mileage?: number;
  /** En la entrega: daños previos (no se cobran). En la devolución: daños nuevos. */
  damages?: Damage[];
  notes?: string;
}

export interface PickupInput extends InspectionInput {
  /** Placa elegida por el agente; si no se indica, se asigna la primera libre del modelo en la agencia. */
  fleetUnitId?: string;
}

export interface ReturnInput extends InspectionInput {
  cleanliness?: Cleanliness;
  /** Hora real de la devolución (por defecto, ahora): permite registrarla después. */
  returnedAt?: Date;
}

export interface ReturnPreview {
  charges: ReturnChargeResult;
  /** Combustible y tanque usados en el cálculo (para mostrarlos en el panel). */
  /** pricePerGallon es el precio por kWh en los eléctricos (batteryKwh no nulo). */
  fuel: { grade: FuelGrade; tankLiters: number; batteryKwh: number | null; policy: FuelPolicy; pricePerGallon: number; pickupEighths: number | null };
  hasFullCoverage: boolean;
  maintenanceDue: boolean;
  nextMaintenanceKm: number;
}

/**
 * RN25 + RN28 — operación en mostrador (panel de administración):
 *  - Entrega: el cliente reservó un MODELO; aquí se asigna una unidad física (placa) libre de ese modelo
 *    en la agencia de recogida y se registra su estado (combustible, km, daños previos).
 *  - Devolución: inspección (combustible, km, limpieza, daños nuevos, hora real), cargos adicionales con su
 *    factura, la unidad queda en la agencia de devolución y pasa a taller si hay un daño grave o le toca
 *    mantenimiento por kilometraje.
 * No cambian el `status` del contrato (sigue CONFIRMED); cambian el estado operativo `rental_status`.
 */
@Injectable()
export class RentalOperationsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly settings: ChargeSettingsService,
    private readonly invoices: InvoiceService,
  ) {}

  async pickUp(reservationId: string, input: PickupInput, actorSub: string, now = new Date()): Promise<Reservation> {
    try {
      return await this.dataSource.transaction(async (m) => {
        const reservation = await this.lock(m, reservationId);
        if (reservation.status !== OrderStatus.Confirmed || reservation.rentalStatus !== RentalStatus.NotStarted) {
          throw conflict('Solo se puede entregar una reserva confirmada que aún no se ha entregado');
        }
        const unit = input.fleetUnitId
          ? await this.validUnit(m, reservation, input.fleetUnitId)
          : await this.firstFreeUnit(m, reservation);
        const mileage = assertMileage(input.mileage, unit.mileage);
        const fuelEighths = input.fuelEighths ?? TANK_EIGHTHS;

        const before = { rental_status: reservation.rentalStatus };
        await m.update(Reservation, reservation.id, {
          fleetUnitId: unit.id,
          rentalStatus: RentalStatus.PickedUp,
          vehicleSnapshot: { ...reservation.vehicleSnapshot, plate: unit.plate },
          version: reservation.version + 1,
        });
        if (mileage !== unit.mileage) await m.update(FleetUnit, unit.id, { mileage });
        await m.save(RentalInspection, m.create(RentalInspection, {
          reservationId: reservation.id, kind: InspectionKind.Pickup, fleetUnitId: unit.id, fuelEighths, mileage,
          damages: input.damages ?? [], notes: input.notes?.trim() || null, performedAt: now, createdBy: actorSub,
        }));
        await this.history(m, reservation.id, ReservationAction.PickedUp, actorSub, before,
          { rental_status: RentalStatus.PickedUp, plate: unit.plate, fuel_eighths: fuelEighths, mileage });
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

  /** Cargos que generaría la devolución, sin registrar nada (el panel los muestra antes de confirmar). */
  async previewReturn(reservationId: string, input: ReturnInput, now = new Date()): Promise<ReturnPreview> {
    const m = this.dataSource.manager;
    const reservation = isUuid(reservationId) ? await m.findOne(Reservation, { where: { id: reservationId }, relations: { extras: true } }) : null;
    if (!reservation) throw DomainError.notFound('La reserva no existe');
    return (await this.evaluateReturn(m, reservation, input, now)).preview;
  }

  async return(reservationId: string, input: ReturnInput, actorSub: string, now = new Date()): Promise<Reservation> {
    return this.dataSource.transaction(async (m) => {
      const reservation = await this.lock(m, reservationId);
      const { preview, unit, mileage, returnedAt } = await this.evaluateReturn(m, reservation, input, now);
      const { charges } = preview;

      const toWorkshop = charges.hasSevereDamage || preview.maintenanceDue;
      // La unidad queda donde se devolvió (en un one-way cambia de agencia); a taller si hace falta.
      await m.update(FleetUnit, unit.id, {
        depotId: reservation.dropoffDepotId, mileage, ...(toWorkshop ? { status: UnitStatus.Maintenance } : {}),
      });
      await m.update(Reservation, reservation.id, { rentalStatus: RentalStatus.Returned, version: reservation.version + 1 });

      const invoice = charges.lines.length
        ? await this.invoices.issueCharges(m, reservation, charges.lines, `Cargos de la devolución de la reserva ${reservation.locator}`)
        : null;
      await m.save(RentalInspection, m.create(RentalInspection, {
        reservationId: reservation.id, kind: InspectionKind.Return, fleetUnitId: unit.id, fuelEighths: input.fuelEighths ?? TANK_EIGHTHS,
        mileage, cleanliness: input.cleanliness ?? Cleanliness.Clean, damages: input.damages ?? [], notes: input.notes?.trim() || null,
        performedAt: returnedAt, charges: charges.lines, chargeNotes: charges.notes, chargesSubtotal: charges.subtotal,
        invoiceId: invoice?.id ?? null, maintenanceDue: preview.maintenanceDue, createdBy: actorSub,
      }));
      await this.history(m, reservation.id, ReservationAction.Returned, actorSub,
        { rental_status: RentalStatus.PickedUp },
        { rental_status: RentalStatus.Returned, mileage, charges_subtotal: charges.subtotal, to_workshop: toWorkshop });
      return m.findOneOrFail(Reservation, { where: { id: reservation.id }, relations: { extras: true } });
    });
  }

  inspections(reservationId: string, manager: EntityManager = this.dataSource.manager): Promise<RentalInspection[]> {
    return manager.find(RentalInspection, { where: { reservationId }, order: { performedAt: 'ASC' } });
  }

  private async evaluateReturn(m: EntityManager, reservation: Reservation, input: ReturnInput, now: Date) {
    if (reservation.rentalStatus !== RentalStatus.PickedUp || !reservation.fleetUnitId) {
      throw conflict('Solo se puede registrar la devolución de un vehículo entregado');
    }
    const unit = await m.findOneOrFail(FleetUnit, { where: { id: reservation.fleetUnitId } });
    const model = await m.findOneOrFail(VehicleModel, { where: { id: reservation.vehicleModelId } });
    const pickup = await m.findOne(RentalInspection, { where: { reservationId: reservation.id, kind: InspectionKind.Pickup } });
    const mileage = assertMileage(input.mileage, unit.mileage);
    const returnedAt = input.returnedAt ?? now;
    if (returnedAt > now) throw DomainError.validation('La hora de devolución no puede ser futura', [{ name: 'returnedAt', reason: 'futura' }]);
    if (pickup && returnedAt < pickup.performedAt) {
      throw DomainError.validation('La devolución no puede ser anterior a la entrega', [{ name: 'returnedAt', reason: 'anterior a la entrega' }]);
    }

    const settings = ChargeSettingsService.toDomain(await this.settings.get(m));
    const hasFullCoverage = (reservation.extras ?? []).some((e) => e.code === FULL_COVERAGE_EXTRA)
      || reservation.priceBreakdown.lines.some((l) => l.code === FULL_COVERAGE_EXTRA)
      || (reservation.partnerData as { coverage_type?: string } | null)?.coverage_type === 'TOTAL';
    const dailyRate = reservation.priceBreakdown.lines.find((l) => l.code === 'BASE')?.unit_price ?? 0;
    const charges = computeReturnCharges({
      fuelPolicy: model.fuelPolicy, fuelGrade: model.fuelGrade, tankLiters: model.tankCapacityL, batteryKwh: model.batteryKwh,
      pickupFuelEighths: pickup?.fuelEighths ?? null, returnFuelEighths: input.fuelEighths ?? TANK_EIGHTHS,
      cleanliness: input.cleanliness ?? Cleanliness.Clean, damages: input.damages ?? [], hasFullCoverage,
      pickupAt: reservation.pickupAt, scheduledDropoffAt: reservation.dropoffAt, returnedAt, dailyRate,
    }, settings);
    const threshold = nextMaintenanceKm(unit.mileage);
    const preview: ReturnPreview = {
      charges,
      fuel: { grade: model.fuelGrade, tankLiters: model.tankCapacityL, batteryKwh: model.batteryKwh, policy: model.fuelPolicy, pricePerGallon: settings.fuelPrices[model.fuelGrade], pickupEighths: pickup?.fuelEighths ?? null },
      hasFullCoverage,
      maintenanceDue: mileage >= threshold,
      nextMaintenanceKm: threshold,
    };
    return { preview, unit, mileage, returnedAt };
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
                             AND ${occupiedPeriodSql('r')} && tstzrange($3::timestamptz, $4::timestamptz, '[)'))
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

/** El odómetro nunca retrocede. */
function assertMileage(value: number | undefined, current: number): number {
  if (value === undefined) return current;
  if (value < current) {
    throw DomainError.validation(`El kilometraje no puede ser menor que el registrado (${current} km)`, [{ name: 'mileage', reason: `mínimo ${current}` }]);
  }
  return value;
}
