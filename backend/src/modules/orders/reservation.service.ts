import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { inTransaction } from '../../common/transaction';
import { evaluateCancellation } from '../../domain/cancellation-policy';
import { normalizeName, normalizePhone } from '../../domain/contact-rules';
import { isDepotOpenAt } from '../../domain/depot-schedule';
import { LocationQuery, resolveDepots } from '../../domain/depot-locator';
import { CleaningCooldownError, DomainError, ProblemCode } from '../../domain/domain-error';
import { BUSINESS_RULES } from '../../domain/business-rules';
import { HoldStatus, OrderChannel, OrderStatus, RentalStatus, UnitStatus } from '../../domain/enums';
import { cleaningCooldownUntil } from '../../domain/fleet-state';
import { generateLocator } from '../../domain/locator';
import { assertDriverDetails, assertPaymentReference, DriverDetails } from '../../domain/order-rules';
import { validateRentalWindow } from '../../domain/rental-period';
import { AvailabilityService } from '../availability/availability.service';
import { CatalogService } from '../catalog/catalog.service';
import { Depot } from '../catalog/entities/depot.entity';
import { Extra } from '../catalog/entities/extra.entity';
import { FleetUnit } from '../catalog/entities/fleet-unit.entity';
import { VehicleModel } from '../catalog/entities/vehicle-model.entity';
import { DomainEventType } from '../events/domain-events';
import { OutboxService } from '../events/outbox.service';
import { Hold } from './entities/hold.entity';
import { OrderPreview } from './entities/order-preview.entity';
import { ReservationExtra } from './entities/reservation-extra.entity';
import { ReservationAction, ReservationHistory } from './entities/reservation-history.entity';
import { Reservation } from './entities/reservation.entity';
import { SearchSession } from './entities/search-session.entity';
import { OrderPricingService, Quote } from './order-pricing.service';
import { buildRouteSnapshot, buildVehicleSnapshot } from './reservation-snapshots';
import { isUuid } from './uuid';

export interface CreateReservationInput {
  orderPreviewId: string;
  paymentReference: string;
  driver: DriverDetails;
  /** Nombres de campo de la API que llama (para invalidParams). */
  driverFields: { firstName: string; lastName: string; email: string; phone: string };
  ownerSub: string;
  channel: OrderChannel;
  userId?: string | null;
  affiliateId?: number | null;
}

/** Reserva de un auto concreto (placa) pedida por Booking Prototipo — contrato v3. */
export interface CreateUnitReservationInput {
  fleetUnitId: string;
  pickupAt: Date;
  dropoffAt: Date;
  driver: { firstName: string; lastName: string; email: string; phone: string | null; age: number };
  extraCodes: string[];
  ownerSub: string;
  /** PNR que verá Booking (ej. CAR7K2Q9). */
  locator: string;
  paymentReference: string;
  partnerData: Record<string, unknown>;
}

export interface CancellationOutcome {
  reservation: Reservation;
  /** Importe que se devuelve al cliente (total − penalización). */
  refundAmount: number;
  refundPercentage: number;
}

export interface ModifyReservationInput {
  extrasToAdd?: string[];
  extrasToRemove?: string[];
  pickupAt?: Date;
  dropoffAt?: Date;
  pickupLocation?: LocationQuery;
  dropoffLocation?: LocationQuery;
}

const NOT_AVAILABLE = () =>
  DomainError.conflict(ProblemCode.CarNoLongerAvailable, 'Vehículo no disponible', 'Ya no quedan unidades de este modelo para esas fechas');

/**
 * Ciclo de vida de una reserva (orden). Lo usan la API de integración (Booking Hub) y la API interna (web):
 * las reglas de negocio están aquí una sola vez. Todas las escrituras son transaccionales y registran
 * historial y evento de dominio (outbox) en la misma transacción.
 */
@Injectable()
export class ReservationService {
  constructor(
    private readonly catalog: CatalogService,
    private readonly availability: AvailabilityService,
    private readonly pricing: OrderPricingService,
    private readonly outbox: OutboxService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /** POST /orders/create — RN17–RN20. */
  async create(input: CreateReservationInput, manager?: EntityManager, now = new Date()): Promise<Reservation> {
    assertPaymentReference(input.paymentReference);
    assertDriverDetails(input.driver, input.driverFields);

    return inTransaction(this.dataSource, manager, async (m) => {
      const preview = isUuid(input.orderPreviewId)
        ? await m.findOne(OrderPreview, { where: { id: input.orderPreviewId }, lock: { mode: 'pessimistic_write' } })
        : null;
      if (!preview || preview.ownerSub !== input.ownerSub) {
        throw DomainError.validation('La preview no existe', [{ name: 'order_preview_id', reason: 'inexistente' }]);
      }
      if (preview.consumedAt) {
        throw new DomainError(ProblemCode.ValidationFailed, 409, 'Conflicto', 'Esta preview ya se usó para crear una orden');
      }

      const session = await m.findOneOrFail(SearchSession, { where: { id: preview.searchSessionId } });
      const { model, pickupDepot, dropoffDepot } = await this.loadCatalog(preview.vehicleModelId, preview.pickupDepotId, preview.dropoffDepotId);
      const base = { model, pickupDepot, dropoffDepot, pickupAt: session.pickupAt, dropoffAt: session.dropoffAt, driverAge: session.driverAge };
      this.pricing.assertBookable(base);

      await this.availability.lockVehicleModel(m, model.id);
      const hold = preview.holdId ? await m.findOne(Hold, { where: { id: preview.holdId } }) : null;
      const activeHold = hold && hold.status === HoldStatus.Held && hold.expiresAt > now ? hold : null;
      const units = await this.availability.countAvailableUnits(m, {
        vehicleModelId: model.id, depotId: pickupDepot.id, pickupAt: session.pickupAt, dropoffAt: session.dropoffAt, excludeHoldId: activeHold?.id,
      });
      if (units === 0) throw NOT_AVAILABLE();

      // RN17: si la preview expiró se recotiza; si el precio cambió, el cliente debe aceptarlo con una nueva preview.
      const quote = await this.pricing.quote({ ...base, currency: preview.currency, extraCodes: preview.extras });
      if (preview.expiresAt <= now && quote.breakdown.total !== preview.totalPrice) {
        throw DomainError.conflict(ProblemCode.PriceChanged, 'El precio cambió',
          `El total pasó de ${preview.totalPrice} a ${quote.breakdown.total} ${preview.currency}; genera una nueva preview`);
      }
      const breakdown = preview.expiresAt <= now ? quote.breakdown : preview.breakdown;

      const reservation = await m.save(Reservation, m.create(Reservation, {
        locator: generateLocator(model.supplier.code),
        status: OrderStatus.Confirmed, // RN19: PENDING queda para la verificación asíncrona del pago (futuro)
        rentalStatus: RentalStatus.NotStarted,
        channel: input.channel,
        ownerSub: input.ownerSub,
        userId: input.userId ?? null,
        affiliateId: input.affiliateId ?? session.affiliateId ?? null,
        vehicleModelId: model.id,
        pickupDepotId: pickupDepot.id,
        dropoffDepotId: dropoffDepot.id,
        pickupAt: session.pickupAt,
        dropoffAt: session.dropoffAt,
        driverFirstName: normalizeName(input.driver.firstName!),
        driverLastName: normalizeName(input.driver.lastName!),
        driverEmail: input.driver.email!.trim().toLowerCase(),
        driverPhone: input.driver.phone?.trim() ? normalizePhone(input.driver.phone) : null,
        driverAge: session.driverAge,
        bookerCountry: session.bookerCountry,
        vehicleSnapshot: buildVehicleSnapshot(model, breakdown),
        routeSnapshot: buildRouteSnapshot(pickupDepot, dropoffDepot, session.pickupAt, session.dropoffAt, breakdown.rental_days),
        priceBreakdown: breakdown,
        totalPrice: breakdown.total,
        currency: breakdown.currency,
        paymentReference: input.paymentReference,
        orderPreviewId: preview.id,
        holdId: activeHold?.id ?? null,
      }));
      await this.saveExtras(m, reservation.id, quote.extras, breakdown);

      if (activeHold) await m.update(Hold, activeHold.id, { status: HoldStatus.Consumed });
      await m.update(OrderPreview, preview.id, { consumedAt: now });
      await this.history(m, reservation, ReservationAction.Created, input.ownerSub, null);
      await this.outbox.record(m, DomainEventType.CarOrderConfirmed, reservation.id, eventPayload(reservation));

      return this.reload(m, reservation.id);
    });
  }

  /**
   * Contrato v3: Booking reserva un auto concreto (vehicle_id = placa), no un modelo. La unidad queda asignada
   * desde ya; la BD impide que se asigne a dos alquileres solapados (EXCLUDE reservations_unit_no_overlap).
   * Además se respeta el inventario por modelo, para no vender de más frente a las reservas web (que reservan modelo).
   */
  async createForUnit(input: CreateUnitReservationInput, manager?: EntityManager, now = new Date()): Promise<Reservation> {
    validateRentalWindow(input.pickupAt, input.dropoffAt, now, 'dates');

    return inTransaction(this.dataSource, manager, async (m) => {
      const unit = await m.findOne(FleetUnit, { where: { id: input.fleetUnitId }, lock: { mode: 'pessimistic_write' } });
      if (!unit || !unit.active || unit.status !== UnitStatus.Available) {
        throw DomainError.conflict(ProblemCode.CarNoLongerAvailable, 'Vehículo no disponible', 'El vehículo está fuera de servicio o en mantenimiento');
      }
      const { model, pickupDepot, dropoffDepot } = await this.loadCatalog(unit.vehicleModelId, unit.depotId, unit.depotId);
      const base = { model, pickupDepot, dropoffDepot, pickupAt: input.pickupAt, dropoffAt: input.dropoffAt, driverAge: input.driver.age };
      this.pricing.assertBookable(base);

      await this.availability.lockVehicleModel(m, model.id);
      await this.assertUnitFree(m, unit.id, input.pickupAt, input.dropoffAt, now);
      const units = await this.availability.countAvailableUnits(m, {
        vehicleModelId: model.id, depotId: pickupDepot.id, pickupAt: input.pickupAt, dropoffAt: input.dropoffAt,
      });
      if (units === 0) throw NOT_AVAILABLE();

      const quote = await this.pricing.quote({ ...base, currency: BUSINESS_RULES.BASE_CURRENCY, extraCodes: input.extraCodes });
      const reservation = await m.save(Reservation, m.create(Reservation, {
        locator: input.locator,
        status: OrderStatus.Confirmed,
        rentalStatus: RentalStatus.NotStarted,
        channel: OrderChannel.BookingHub,
        ownerSub: input.ownerSub,
        vehicleModelId: model.id,
        fleetUnitId: unit.id,
        pickupDepotId: pickupDepot.id,
        dropoffDepotId: dropoffDepot.id,
        pickupAt: input.pickupAt,
        dropoffAt: input.dropoffAt,
        driverFirstName: normalizeName(input.driver.firstName).slice(0, 60),
        driverLastName: normalizeName(input.driver.lastName).slice(0, 60),
        driverEmail: input.driver.email.trim().toLowerCase(),
        driverPhone: input.driver.phone ? normalizePhone(input.driver.phone).slice(0, 30) : null,
        driverAge: input.driver.age,
        bookerCountry: 'EC',
        vehicleSnapshot: buildVehicleSnapshot(model, quote.breakdown, unit.plate),
        routeSnapshot: buildRouteSnapshot(pickupDepot, dropoffDepot, input.pickupAt, input.dropoffAt, quote.breakdown.rental_days),
        priceBreakdown: quote.breakdown,
        totalPrice: quote.breakdown.total,
        currency: quote.breakdown.currency,
        paymentReference: input.paymentReference,
        partnerData: input.partnerData,
      }));
      await this.saveExtras(m, reservation.id, quote.extras, quote.breakdown);
      await this.history(m, reservation, ReservationAction.Created, input.ownerSub, null);
      await this.outbox.record(m, DomainEventType.CarOrderConfirmed, reservation.id, eventPayload(reservation));
      return this.reload(m, reservation.id);
    });
  }

  /** Reserva de un socio buscada por id (uuid) o por PNR. Solo las del dueño indicado. */
  async findForPartner(idOrLocator: string, ownerSub: string, manager: EntityManager = this.dataSource.manager): Promise<Reservation> {
    const value: string = idOrLocator.trim();
    const where = isUuid(value) ? { id: value } : { locator: idOrLocator.trim().toUpperCase() };
    const reservation = await manager.findOne(Reservation, { where, relations: { extras: true } });
    if (!reservation || reservation.ownerSub !== ownerSub) throw DomainError.notFound('La orden no existe');
    return reservation;
  }

  listForPartner(ownerSub: string, limit = 100): Promise<Reservation[]> {
    return this.dataSource.getRepository(Reservation).find({
      where: { ownerSub }, relations: { extras: true }, order: { createdAt: 'DESC' }, take: limit,
    });
  }

  /**
   * Cancelación pedida por Booking. waiveFee = compensación de la Saga (o decisión del administrador):
   * reembolso del 100 % sin penalización. Si no, se aplica la política comercial normal (RN22).
   */
  async cancelForPartner(
    idOrLocator: string, ownerSub: string, waiveFee: boolean, manager?: EntityManager, now = new Date(),
  ): Promise<CancellationOutcome> {
    const { id } = await this.findForPartner(idOrLocator, ownerSub, manager);
    const reservation = await this.doCancel(id, ownerSub, ownerSub, manager, now, waiveFee);
    return cancellationOutcome(reservation);
  }

  /** GET /orders/{orderId} — RN23: solo el dueño; si es de otro, 404 (no revela que existe). */
  async getForOwner(id: string, ownerSub: string, manager: EntityManager = this.dataSource.manager): Promise<Reservation> {
    const reservation = isUuid(id) ? await manager.findOne(Reservation, { where: { id }, relations: { extras: true } }) : null;
    if (!reservation || reservation.ownerSub !== ownerSub) throw DomainError.notFound('La orden no existe');
    return reservation;
  }

  listForOwner(ownerSub: string): Promise<Reservation[]> {
    return this.dataSource.getRepository(Reservation).find({
      where: { ownerSub }, relations: { extras: true }, order: { createdAt: 'DESC' },
    });
  }

  /** POST /orders/{orderId}/modify — RN21: solo CONFIRMED y antes de la recogida; recotiza y revalida stock. */
  async modify(id: string, ownerSub: string, changes: ModifyReservationInput, manager?: EntityManager, now = new Date()): Promise<Reservation> {
    return inTransaction(this.dataSource, manager, async (m) => {
      const reservation = await this.lockOwned(m, id, ownerSub);
      if (reservation.status !== OrderStatus.Confirmed) {
        throw DomainError.conflict(ProblemCode.BookingNotConfirmed, 'Reserva no confirmada', 'Solo se pueden modificar reservas confirmadas');
      }
      if (reservation.rentalStatus !== RentalStatus.NotStarted || now >= reservation.pickupAt) {
        throw new DomainError(ProblemCode.ValidationFailed, 409, 'Conflicto', 'El alquiler ya comenzó; no se puede modificar');
      }

      const before = snapshotForHistory(reservation);
      const pickupAt = changes.pickupAt ?? reservation.pickupAt;
      const dropoffAt = changes.dropoffAt ?? reservation.dropoffAt;
      if (changes.pickupAt || changes.dropoffAt) validateRentalWindow(pickupAt, dropoffAt, now);

      const model = await this.catalog.findModel(reservation.vehicleModelId);
      if (!model) throw NOT_AVAILABLE();
      const pickupDepot = await this.chooseDepot(changes.pickupLocation, reservation.pickupDepotId, model, pickupAt, 'route.pickup.location');
      const dropoffDepot = await this.chooseDepot(changes.dropoffLocation, reservation.dropoffDepotId, model, dropoffAt, 'route.dropoff.location');
      const base = { model, pickupDepot, dropoffDepot, pickupAt, dropoffAt, driverAge: reservation.driverAge };
      this.pricing.assertBookable(base);

      await this.availability.lockVehicleModel(m, model.id);
      const units = await this.availability.countAvailableUnits(m, {
        vehicleModelId: model.id, depotId: pickupDepot.id, pickupAt, dropoffAt, excludeReservationId: reservation.id,
      });
      if (units === 0) throw NOT_AVAILABLE();

      const remove = new Set((changes.extrasToRemove ?? []).map((c) => c.toUpperCase()));
      const extraCodes = [...reservation.extras.map((e) => e.code).filter((c) => !remove.has(c)), ...(changes.extrasToAdd ?? [])];
      const quote = await this.pricing.quote({ ...base, currency: reservation.currency, extraCodes, extrasField: 'extras_to_add' });

      await m.update(Reservation, reservation.id, {
        pickupDepotId: pickupDepot.id,
        dropoffDepotId: dropoffDepot.id,
        pickupAt,
        dropoffAt,
        vehicleSnapshot: buildVehicleSnapshot(model, quote.breakdown),
        routeSnapshot: buildRouteSnapshot(pickupDepot, dropoffDepot, pickupAt, dropoffAt, quote.breakdown.rental_days),
        priceBreakdown: quote.breakdown,
        totalPrice: quote.breakdown.total,
        version: reservation.version + 1,
      });
      await m.delete(ReservationExtra, { reservationId: reservation.id });
      await this.saveExtras(m, reservation.id, quote.extras, quote.breakdown);

      const updated = await this.reload(m, reservation.id);
      await this.history(m, updated, ReservationAction.Modified, ownerSub, before);
      await this.outbox.record(m, DomainEventType.CarOrderModified, updated.id, eventPayload(updated));
      return updated;
    });
  }

  /** POST /orders/{orderId}/cancel — RN22. Solo el dueño. */
  cancel(id: string, ownerSub: string, manager?: EntityManager, now = new Date()): Promise<Reservation> {
    return this.doCancel(id, ownerSub, ownerSub, manager, now);
  }

  /** Cancelación desde el panel de administración: cualquier reserva; el historial registra al admin. */
  cancelAsAdmin(id: string, adminSub: string, now = new Date()): Promise<Reservation> {
    return this.doCancel(id, null, adminSub, undefined, now);
  }

  private async doCancel(
    id: string, ownerSub: string | null, actorSub: string, manager: EntityManager | undefined, now: Date, waiveFee = false,
  ): Promise<Reservation> {
    return inTransaction(this.dataSource, manager, async (m) => {
      const reservation = await this.lockOwned(m, id, ownerSub);
      const baseLine = reservation.priceBreakdown.lines.find((line) => line.code === 'BASE');
      const evaluation = evaluateCancellation({
        status: reservation.status, rentalStatus: reservation.rentalStatus, pickupAt: reservation.pickupAt, now,
        dailyAmount: baseLine?.unit_price ?? 0,
      });
      const fee = waiveFee ? 0 : evaluation.fee;

      const before = snapshotForHistory(reservation);
      await m.update(Reservation, reservation.id, {
        status: OrderStatus.Cancelled, cancelledAt: now, cancellationFee: fee, version: reservation.version + 1,
      });
      const cancelled = await this.reload(m, reservation.id);
      await this.history(m, cancelled, ReservationAction.Cancelled, actorSub, before);
      await this.outbox.record(m, DomainEventType.CarOrderCancelled, cancelled.id, { ...eventPayload(cancelled), cancellation_fee: fee });
      return cancelled;
    });
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  /**
   * La placa no tiene otro alquiler que se cruce (con el margen de limpieza), ni un bloqueo del taller,
   * ni está en el cooldown de 2 h de su última devolución. Un alquiler entregado y vencido sigue ocupando la placa.
   */
  private async assertUnitFree(m: EntityManager, unitId: string, pickupAt: Date, dropoffAt: Date, now: Date): Promise<void> {
    const [row] = await m.query(
      `WITH req AS (
         SELECT tstzrange($2::timestamptz - make_interval(mins => $4), $3::timestamptz + make_interval(mins => $4), '[)') AS period
       )
       SELECT
         EXISTS (SELECT 1 FROM reservations r, req
                  WHERE r.fleet_unit_id = $1 AND r.status IN ('PENDING', 'CONFIRMED') AND r.rental_status <> 'RETURNED'
                    AND tstzrange(r.pickup_at, CASE WHEN r.rental_status = 'PICKED_UP' THEN greatest(r.dropoff_at, $5::timestamptz)
                                                    ELSE r.dropoff_at END, '[)') && req.period) AS taken,
         EXISTS (SELECT 1 FROM vehicle_blocks b, req WHERE b.fleet_unit_id = $1 AND b.period && req.period) AS blocked,
         (SELECT max(h.created_at) FROM reservation_history h JOIN reservations r ON r.id = h.reservation_id
           WHERE r.fleet_unit_id = $1 AND h.action = 'RETURNED') AS last_returned_at`,
      [unitId, pickupAt, dropoffAt, BUSINESS_RULES.CLEANING_BUFFER_MINUTES, now],
    );
    const cooldownUntil = cleaningCooldownUntil(row.last_returned_at ? new Date(row.last_returned_at) : null);
    if (cooldownUntil && pickupAt < cooldownUntil) throw new CleaningCooldownError(cooldownUntil);
    if (row.taken || row.blocked) {
      throw DomainError.conflict(ProblemCode.CarNoLongerAvailable, 'Vehículo no disponible', 'El vehículo ya está reservado o en el taller en esas fechas');
    }
  }

  private async loadCatalog(modelId: string, pickupDepotId: number, dropoffDepotId: number) {
    const [model, pickupDepot, dropoffDepot] = await Promise.all([
      this.catalog.findModel(modelId), this.catalog.findDepot(pickupDepotId), this.catalog.findDepot(dropoffDepotId),
    ]);
    if (!model || !pickupDepot || !dropoffDepot) throw NOT_AVAILABLE();
    return { model, pickupDepot, dropoffDepot };
  }

  /**
   * Bloquea la fila (FOR UPDATE) para que dos modificaciones/cancelaciones no se pisen.
   * ownerSub = null → acceso de administrador (sin comprobar dueño).
   */
  private async lockOwned(m: EntityManager, id: string, ownerSub: string | null): Promise<Reservation> {
    const locked = isUuid(id) ? await m.findOne(Reservation, { where: { id }, lock: { mode: 'pessimistic_write' } }) : null;
    if (!locked || (ownerSub !== null && locked.ownerSub !== ownerSub)) throw DomainError.notFound('La orden no existe');
    return this.reload(m, id);
  }

  /** Nueva ubicación en una modificación: agencia del mismo proveedor, abierta a esa hora. */
  private async chooseDepot(
    location: LocationQuery | undefined, currentId: number, model: VehicleModel, at: Date, field: string,
  ): Promise<Depot> {
    if (!location) {
      const current = await this.catalog.findDepot(currentId);
      if (!current) throw NOT_AVAILABLE();
      return current;
    }
    const candidates = resolveDepots(await this.catalog.activeDepots(), location, field)
      .filter((d) => d.supplierId === model.supplierId);
    const open = candidates.find((d) => isDepotOpenAt(d.openingHours, d.timezone, at));
    if (!open) {
      throw candidates.length
        ? DomainError.conflict(ProblemCode.DepotClosed, 'Agencia cerrada', 'La agencia está cerrada a la hora solicitada')
        : DomainError.validation('No hay agencias del proveedor en esa ubicación', [{ name: field, reason: 'sin agencias' }]);
    }
    return open;
  }

  private async saveExtras(m: EntityManager, reservationId: string, extras: Extra[], breakdown: Quote['breakdown']) {
    if (!extras.length) return;
    await m.save(ReservationExtra, extras.map((extra) => {
      const line = breakdown.lines.find((l) => l.code === extra.code)!;
      return { reservationId, extraId: extra.id, code: extra.code, name: extra.name, unitPrice: line.unit_price, days: line.quantity, subtotal: line.amount };
    }));
  }

  private history(m: EntityManager, reservation: Reservation, action: ReservationAction, actorSub: string, before: Record<string, unknown> | null) {
    return m.save(ReservationHistory, { reservationId: reservation.id, action, actorSub, before, after: snapshotForHistory(reservation) });
  }

  private reload(m: EntityManager, id: string): Promise<Reservation> {
    return m.findOneOrFail(Reservation, { where: { id }, relations: { extras: true } });
  }
}

/** Reembolso de una reserva ya cancelada (total − penalización registrada). */
export function cancellationOutcome(reservation: Reservation): CancellationOutcome {
  const refundAmount = Math.round((reservation.totalPrice - (reservation.cancellationFee ?? 0)) * 100) / 100;
  const refundPercentage = reservation.totalPrice > 0 ? Math.round((refundAmount / reservation.totalPrice) * 100) : 100;
  return { reservation, refundAmount, refundPercentage };
}

function snapshotForHistory(r: Reservation): Record<string, unknown> {
  return {
    status: r.status, pickup_at: r.pickupAt, dropoff_at: r.dropoffAt, pickup_depot_id: r.pickupDepotId,
    dropoff_depot_id: r.dropoffDepotId, total_price: r.totalPrice, extras: r.extras?.map((e) => e.code) ?? [],
  };
}

/** Datos del evento (WebhookPayload.data). */
function eventPayload(r: Reservation): Record<string, unknown> {
  return {
    order_id: r.id, locator: r.locator, status: r.status, vehicle_id: r.vehicleModelId,
    pickup_datetime: r.pickupAt, dropoff_datetime: r.dropoffAt, total_price: r.totalPrice, currency: r.currency,
  };
}
