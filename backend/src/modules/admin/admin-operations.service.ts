import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Brackets, DataSource } from 'typeorm';
import { DomainError, ProblemCode } from '../../domain/domain-error';
import { OrderStatus, RentalStatus } from '../../domain/enums';
import { ReservationHistory } from '../orders/entities/reservation-history.entity';
import { Reservation } from '../orders/entities/reservation.entity';
import { RentalOperationsService } from '../orders/rental-operations.service';
import { isUuid } from '../orders/uuid';
import { ReservationFiltersDto } from './dto/admin.dto';
import { VoucherService } from '../vouchers/voucher.service';
import { InvoiceService } from '../invoices/invoice.service';
import { toInvoiceView } from '../invoices/invoice.mapper';
import { AdminCallContext, ClientsClient, toAdminClient } from '../clients/clients.client';
import { BOOKING_PARTNER_SUB } from '../../domain/partners';
import { BookingCheckin } from '../orders/entities/booking-checkin.entity';

const TZ = 'America/Guayaquil';
const LIST_LIMIT = 200;

/** Dashboard, gestión de reservas y de usuarios del panel de administración. */
@Injectable()
export class AdminOperationsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly rentals: RentalOperationsService,
    private readonly vouchers: VoucherService,
    private readonly invoices: InvoiceService,
    private readonly clients: ClientsClient,
  ) {}

  // ── Dashboard ─────────────────────────────────────────────────────────────
  async dashboard() {
    const q = <T>(sql: string, params: unknown[] = []) => this.dataSource.query(sql, params) as Promise<T>;
    const today = `(now() AT TIME ZONE '${TZ}')::date`;

    const [counts] = await q<Record<string, number>[]>(`
      SELECT
        count(*) FILTER (WHERE status = 'CONFIRMED' AND rental_status = 'NOT_STARTED' AND (pickup_at AT TIME ZONE '${TZ}')::date = ${today})::int AS pickups_today,
        count(*) FILTER (WHERE rental_status = 'PICKED_UP' AND (dropoff_at AT TIME ZONE '${TZ}')::date = ${today})::int AS returns_today,
        count(*) FILTER (WHERE rental_status = 'PICKED_UP')::int AS active_rentals,
        count(*) FILTER (WHERE status = 'CONFIRMED' AND rental_status = 'NOT_STARTED' AND pickup_at > now())::int AS upcoming,
        count(*) FILTER (WHERE rental_status = 'PICKED_UP' AND dropoff_at < now())::int AS overdue_returns,
        count(*) FILTER (WHERE created_at > now() - interval '30 days' AND channel = 'WEB')::int AS web_last_30d,
        count(*) FILTER (WHERE created_at > now() - interval '30 days' AND channel = 'BOOKING_HUB')::int AS hub_last_30d
      FROM reservations`);
    const revenue = await q<{ currency: string; amount: string }[]>(`
      SELECT currency, sum(CASE WHEN status = 'CANCELLED' THEN coalesce(cancellation_fee, 0) ELSE total_price END) AS amount
        FROM reservations WHERE date_trunc('month', created_at AT TIME ZONE '${TZ}') = date_trunc('month', now() AT TIME ZONE '${TZ}')
       GROUP BY currency ORDER BY currency`);
    const fleet = await q<{ status: string; units: number }[]>(`
      SELECT CASE WHEN EXISTS (SELECT 1 FROM reservations r WHERE r.fleet_unit_id = fu.id AND r.rental_status = 'PICKED_UP')
                  THEN 'IN_USE' ELSE fu.status::text END AS status, count(*)::int AS units
        FROM fleet_units fu WHERE fu.active GROUP BY 1 ORDER BY 1`);
    const [webhooks] = await q<Record<string, number>[]>(`
      SELECT count(*) FILTER (WHERE status = 'FAILED')::int AS failed, count(*) FILTER (WHERE status = 'DEAD')::int AS dead,
             (SELECT count(*)::int FROM outbox_events WHERE dispatched_at IS NULL) AS pending_events
        FROM webhook_deliveries`);
    const recent = await this.dataSource.getRepository(Reservation).find({ order: { createdAt: 'DESC' }, take: 8 });

    return {
      ...counts,
      revenueThisMonth: revenue.map((r) => ({ currency: r.currency, amount: Number(r.amount) })),
      fleet,
      webhooks,
      recentReservations: recent.map((r) => this.summary(r)),
    };
  }

  // ── Reservas ──────────────────────────────────────────────────────────────
  /** ctx: credencial del administrador, para buscar en ms-clientes por cédula/pasaporte (mostrador). */
  async listReservations(filters: ReservationFiltersDto, ctx?: AdminCallContext) {
    const qb = this.dataSource.getRepository(Reservation).createQueryBuilder('r')
      .leftJoinAndSelect('r.pickupDepot', 'pickupDepot')
      .orderBy('r.pickupAt', 'DESC')
      .take(LIST_LIMIT);
    if (filters.status) qb.andWhere('r.status = :status', { status: filters.status });
    if (filters.rentalStatus) qb.andWhere('r.rentalStatus = :rentalStatus', { rentalStatus: filters.rentalStatus });
    if (filters.depotId) qb.andWhere('r.pickupDepotId = :depotId', { depotId: filters.depotId });
    if (filters.from) qb.andWhere(`(r.pickupAt AT TIME ZONE '${TZ}')::date >= :from`, { from: filters.from });
    if (filters.to) qb.andWhere(`(r.pickupAt AT TIME ZONE '${TZ}')::date <= :to`, { to: filters.to });
    if (filters.q) {
      const term = `%${filters.q.toLowerCase()}%`;
      // Mostrador (v3.1): también por cédula/pasaporte del cliente (ms-clientes) o la licencia que mandó Booking
      const clientIds = ctx ? await this.clients.searchIds(filters.q, ctx.credential, ctx.correlationId) : [];
      qb.andWhere(new Brackets((w) => w
        .where('lower(r.locator) LIKE :term', { term })
        .orWhere('lower(r.driverEmail) LIKE :term', { term })
        .orWhere('lower(r.driverLastName) LIKE :term', { term })
        .orWhere(clientIds.length ? 'r.clientId IN (:...clientIds)' : 'false', { clientIds })
        .orWhere(`r.partnerData ->> 'license_number' LIKE :term`, { term })));
    }
    return (await qb.getMany()).map((r) => this.summary(r));
  }

  async reservationDetail(id: string, ctx?: AdminCallContext) {
    const reservation = isUuid(id)
      ? await this.dataSource.getRepository(Reservation).findOne({ where: { id }, relations: { extras: true, pickupDepot: true, dropoffDepot: true } })
      : null;
    if (!reservation) throw DomainError.notFound('La reserva no existe');
    const history = await this.dataSource.getRepository(ReservationHistory).find({ where: { reservationId: id }, order: { createdAt: 'ASC' } });
    const canPickUp = reservation.status === OrderStatus.Confirmed && reservation.rentalStatus === RentalStatus.NotStarted;
    return {
      ...reservation,
      history,
      freeUnits: canPickUp ? await this.rentals.freeUnits(reservation) : [],
      voucherPath: this.vouchers.linkFor(reservation).path,
      invoices: (await this.invoices.listForReservation(reservation.id)).map(toInvoiceView),
      inspections: await this.rentals.inspections(reservation.id),
      client: await this.clientOf(reservation, ctx),
      fromBooking: reservation.ownerSub === BOOKING_PARTNER_SUB,
      bookingCheckin: await this.dataSource.getRepository(BookingCheckin).findOneBy({ reservationId: reservation.id }),
      actions: {
        pickUp: canPickUp,
        return: reservation.rentalStatus === RentalStatus.PickedUp,
        cancel: canPickUp && reservation.pickupAt > new Date(),
      },
    };
  }

  // ── Historial por usuario (lo consulta ms-identidad) ─────────────────────
  /**
   * Los usuarios viven en ms-identidad; aquí solo quedan sus ids en reservas, reseñas y bloqueos. ms-identidad
   * pide este resumen para mostrar cuántas reservas tiene cada cuenta y para no eliminar cuentas con historial.
   */
  async userUsage(): Promise<{ userId: string; reservations: number; reviews: number; blocks: number }[]> {
    return this.dataSource.query(`
      SELECT user_id AS "userId", sum(reservations)::int AS reservations, sum(reviews)::int AS reviews, sum(blocks)::int AS blocks
        FROM (SELECT user_id, 1 AS reservations, 0 AS reviews, 0 AS blocks FROM reservations WHERE user_id IS NOT NULL
              UNION ALL SELECT user_id, 0, 1, 0 FROM depot_reviews WHERE user_id IS NOT NULL
              UNION ALL SELECT created_by, 0, 0, 1 FROM vehicle_blocks WHERE created_by IS NOT NULL) h
       GROUP BY user_id`);
  }

  /** Datos del cliente desde ms-clientes; null si la reserva no tiene cliente o ms-clientes no respondió. */
  private async clientOf(reservation: Reservation, ctx?: AdminCallContext) {
    if (!reservation.clientId || !ctx) return null;
    const client = await this.clients.findById(reservation.clientId, ctx.credential, ctx.correlationId);
    return client ? toAdminClient(client) : null;
  }

  private summary(r: Reservation) {
    return {
      id: r.id,
      locator: r.locator,
      status: r.status,
      rentalStatus: r.rentalStatus,
      channel: r.channel,
      vehicle: (r.vehicleSnapshot as { display_name?: string }).display_name,
      plate: (r.vehicleSnapshot as { plate?: string }).plate ?? null,
      driver: `${r.driverFirstName} ${r.driverLastName}`,
      driverEmail: r.driverEmail,
      identification: (r.partnerData?.license_number as string | undefined) ?? null,
      fromBooking: r.ownerSub === BOOKING_PARTNER_SUB,
      pickupDepot: r.pickupDepot?.name ?? (r.routeSnapshot as { pickup?: { name?: string } }).pickup?.name,
      pickupAt: r.pickupAt,
      dropoffAt: r.dropoffAt,
      totalPrice: r.totalPrice,
      currency: r.currency,
      createdAt: r.createdAt,
    };
  }
}
