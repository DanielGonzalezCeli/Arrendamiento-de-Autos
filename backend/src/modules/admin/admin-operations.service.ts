import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Brackets, DataSource } from 'typeorm';
import { DomainError, ProblemCode } from '../../domain/domain-error';
import { OrderStatus, RentalStatus } from '../../domain/enums';
import { ReservationHistory } from '../orders/entities/reservation-history.entity';
import { Reservation } from '../orders/entities/reservation.entity';
import { RentalOperationsService } from '../orders/rental-operations.service';
import { isUuid } from '../orders/uuid';
import { User } from '../users/user.entity';
import { canonicalEmail, normalizeName, normalizePhone } from '../../domain/contact-rules';
import { UserRole } from '../../domain/enums';
import { hashPassword } from '../users/password';
import { CreateUserDto, ReservationFiltersDto, ResetPasswordDto, UpdateUserDto } from './dto/admin.dto';

const TZ = 'America/Guayaquil';
const LIST_LIMIT = 200;

/** Dashboard, gestión de reservas y de usuarios del panel de administración. */
@Injectable()
export class AdminOperationsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly rentals: RentalOperationsService,
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
  async listReservations(filters: ReservationFiltersDto) {
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
      qb.andWhere(new Brackets((w) => w
        .where('lower(r.locator) LIKE :term', { term })
        .orWhere('lower(r.driverEmail) LIKE :term', { term })
        .orWhere('lower(r.driverLastName) LIKE :term', { term })));
    }
    return (await qb.getMany()).map((r) => this.summary(r));
  }

  async reservationDetail(id: string) {
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
      actions: {
        pickUp: canPickUp,
        return: reservation.rentalStatus === RentalStatus.PickedUp,
        cancel: canPickUp && reservation.pickupAt > new Date(),
      },
    };
  }

  // ── Usuarios ──────────────────────────────────────────────────────────────
  async listUsers() {
    const rows: Record<string, unknown>[] = await this.dataSource.query(`
      SELECT u.id, u.email, u.first_name AS "firstName", u.last_name AS "lastName", u.phone, u.role, u.active,
             u.created_at AS "createdAt", count(r.id)::int AS reservations
        FROM users u LEFT JOIN reservations r ON r.user_id = u.id
       GROUP BY u.id ORDER BY u.created_at DESC`);
    return rows;
  }

  /** El administrador crea cuentas de clientes o de otros administradores, con una contraseña inicial. */
  async createUser(dto: CreateUserDto) {
    const repo = this.dataSource.getRepository(User);
    await this.assertEmailAvailable(dto.email);
    const user = await repo.save(repo.create({
      email: dto.email.trim().toLowerCase(),
      emailCanonical: canonicalEmail(dto.email),
      passwordHash: await hashPassword(dto.password),
      firstName: normalizeName(dto.firstName),
      lastName: normalizeName(dto.lastName),
      phone: dto.phone ? normalizePhone(dto.phone) : null,
      role: dto.role,
      active: true,
    }));
    return this.publicUser(user.id);
  }

  async updateUser(id: string, dto: UpdateUserDto, actingUserId: string) {
    const repo = this.dataSource.getRepository(User);
    const user = await this.findUser(id);
    if (id === actingUserId && (dto.active === false || (dto.role && dto.role !== user.role))) {
      throw new DomainError(ProblemCode.ValidationFailed, 409, 'Conflicto', 'No puedes quitarte el rol de administrador ni desactivar tu propia cuenta');
    }
    const changes: Partial<User> = {};
    if (dto.email !== undefined && canonicalEmail(dto.email) !== user.emailCanonical) {
      await this.assertEmailAvailable(dto.email, id);
      changes.email = dto.email.trim().toLowerCase();
      changes.emailCanonical = canonicalEmail(dto.email);
    } else if (dto.email !== undefined) {
      changes.email = dto.email.trim().toLowerCase();
    }
    if (dto.firstName !== undefined) changes.firstName = normalizeName(dto.firstName);
    if (dto.lastName !== undefined) changes.lastName = normalizeName(dto.lastName);
    if (dto.phone !== undefined) changes.phone = dto.phone ? normalizePhone(dto.phone) : null;
    if (dto.role !== undefined) changes.role = dto.role;
    if (dto.active !== undefined) changes.active = dto.active;
    if (Object.keys(changes).length) await repo.update(id, changes);
    return this.publicUser(id);
  }

  /** Nueva contraseña definida por el administrador (p. ej. si el usuario la olvidó). */
  async resetPassword(id: string, dto: ResetPasswordDto) {
    await this.findUser(id);
    await this.dataSource.getRepository(User).update(id, { passwordHash: await hashPassword(dto.password) });
    return this.publicUser(id);
  }

  /**
   * Solo se eliminan cuentas sin historial (reservas, reseñas o bloqueos de flota registrados). Las demás
   * se desactivan: así se conserva la trazabilidad de lo que hicieron.
   */
  async deleteUser(id: string, actingUserId: string) {
    const user = await this.findUser(id);
    if (id === actingUserId) {
      throw new DomainError(ProblemCode.ValidationFailed, 409, 'Conflicto', 'No puedes eliminar tu propia cuenta');
    }
    const [usage] = await this.dataSource.query(
      `SELECT (SELECT count(*) FROM reservations WHERE user_id = $1)::int AS reservations,
              (SELECT count(*) FROM depot_reviews WHERE user_id = $1)::int AS reviews,
              (SELECT count(*) FROM vehicle_blocks WHERE created_by = $1)::int AS blocks`,
      [id],
    );
    const history = [
      usage.reservations && `${usage.reservations} reserva(s)`,
      usage.reviews && `${usage.reviews} reseña(s)`,
      usage.blocks && `${usage.blocks} bloqueo(s) de flota`,
    ].filter(Boolean);
    if (history.length) {
      throw new DomainError(ProblemCode.ValidationFailed, 409, 'Conflicto',
        `${user.email} tiene ${history.join(', ')}: desactiva la cuenta en lugar de eliminarla para conservar el historial`);
    }
    if (user.role === UserRole.Admin) await this.assertAnotherActiveAdmin(id);
    await this.dataSource.getRepository(User).delete(id);
  }

  private async findUser(id: string): Promise<User> {
    const user = isUuid(id) ? await this.dataSource.getRepository(User).findOneBy({ id }) : null;
    if (!user) throw DomainError.notFound('El usuario no existe');
    return user;
  }

  private async publicUser(id: string) {
    const { passwordHash: _hidden, emailCanonical: _canonical, ...safe } = await this.dataSource.getRepository(User).findOneByOrFail({ id });
    return safe;
  }

  /** Mismas reglas que el registro: en Gmail, puntos y "+etiqueta" no cuentan (correo canónico). */
  private async assertEmailAvailable(email: string, exceptUserId?: string) {
    const existing = await this.dataSource.getRepository(User).findOneBy({ emailCanonical: canonicalEmail(email) });
    if (existing && existing.id !== exceptUserId) {
      throw new DomainError(ProblemCode.ValidationFailed, 409, 'Conflicto', `Ya existe una cuenta con ese correo (${existing.email})`,
        [{ name: 'email', reason: 'ya registrado' }]);
    }
  }

  private async assertAnotherActiveAdmin(exceptUserId: string) {
    const [{ count }] = await this.dataSource.query(
      `SELECT count(*)::int AS count FROM users WHERE role = 'ADMIN' AND active AND id <> $1`, [exceptUserId]);
    if (count === 0) {
      throw new DomainError(ProblemCode.ValidationFailed, 409, 'Conflicto', 'Debe quedar al menos un administrador activo');
    }
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
      pickupDepot: r.pickupDepot?.name ?? (r.routeSnapshot as { pickup?: { name?: string } }).pickup?.name,
      pickupAt: r.pickupAt,
      dropoffAt: r.dropoffAt,
      totalPrice: r.totalPrice,
      currency: r.currency,
      createdAt: r.createdAt,
    };
  }
}
