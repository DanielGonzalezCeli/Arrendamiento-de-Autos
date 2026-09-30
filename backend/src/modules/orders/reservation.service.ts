import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { inTransaction } from '../../common/transaction';
import { evaluateCancellation } from '../../domain/cancellation-policy';
import { normalizeName, normalizePhone } from '../../domain/contact-rules';
import { isDepotOpenAt } from '../../domain/depot-schedule';
import { LocationQuery, resolveDepots } from '../../domain/depot-locator';
import { DomainError, ProblemCode } from '../../domain/domain-error';
import { HoldStatus, OrderChannel, OrderStatus, RentalStatus } from '../../domain/enums';
import { generateLocator } from '../../domain/locator';
import { assertDriverDetails, assertPaymentReference, DriverDetails } from '../../domain/order-rules';
import { validateRentalWindow } from '../../domain/rental-period';
import { AvailabilityService } from '../availability/availability.service';
import { CatalogService } from '../catalog/catalog.service';
import { Depot } from '../catalog/entities/depot.entity';
import { Extra } from '../catalog/entities/extra.entity';
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
    id: string, ownerSub: string | null, actorSub: string, manager: EntityManager | undefined, now: Date,
  ): Promise<Reservation> {
    return inTransaction(this.dataSource, manager, async (m) => {
      const reservation = await this.lockOwned(m, id, ownerSub);
      const baseLine = reservation.priceBreakdown.lines.find((line) => line.code === 'BASE');
      const { fee } = evaluateCancellation({
        status: reservation.status, rentalStatus: reservation.rentalStatus, pickupAt: reservation.pickupAt, now,
        dailyAmount: baseLine?.unit_price ?? 0,
      });

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
