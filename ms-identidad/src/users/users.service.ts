import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Counter } from 'prom-client';
import { Not, Repository } from 'typeorm';
import { metrics } from '../common/metrics';
import { ReservasClient } from '../admin/reservas.client';
import { CreateUserDto, LoginDto, RegisterDto, ResetPasswordDto, UpdateUserDto } from '../auth/auth.dto';
import { TokenService } from '../auth/token.service';
import { canonicalEmail, normalizeName, normalizePhone } from '../common/contact-rules';
import { DomainError } from '../common/problem-details';
import { BCRYPT_COST, hashPassword } from './password';
import { PublicUser, toPublicUser, User, UserRole } from './user.entity';

/** Se compara cuando el correo no existe, para que la respuesta tarde lo mismo y no revele qué correos están registrados. */
const DUMMY_HASH = bcrypt.hashSync('dummy-password-never-used', BCRYPT_COST);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const logins = new Counter({
  name: 'auth_logins_total',
  help: 'Intentos de inicio de sesión, por resultado (ok o rechazado)',
  labelNames: ['result'],
  registers: [metrics],
});

export interface AuthResult {
  accessToken: string;
  tokenType: 'Bearer';
  user: PublicUser;
}

/** Contexto de la petición del administrador, para llamar a ms-reservas en su nombre. */
export interface AdminRequestContext {
  actingUserId: string;
  authorization: string;
  correlationId?: string;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly tokens: TokenService,
    private readonly reservas: ReservasClient,
  ) {}

  // ── Autenticación ─────────────────────────────────────────────────────────
  /** RN27: el registro abierto siempre crea clientes; ADMIN solo lo asigna otro ADMIN o el seed. */
  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.findByEmail(dto.email);
    if (existing) {
      // En Gmail "dan.iel@gmail.com" y "daniel+x@gmail.com" son el mismo buzón que "daniel@gmail.com"
      const sameMailbox = existing.email.toLowerCase() !== dto.email.trim().toLowerCase();
      throw DomainError.conflict(
        sameMailbox
          ? 'Ya existe una cuenta con ese correo: en Gmail los puntos y lo que va después de "+" no cuentan'
          : 'Ya existe una cuenta con ese correo',
        [{ name: 'email', reason: 'ya registrado' }]);
    }
    const user = await this.users.save(this.users.create({
      email: dto.email.trim().toLowerCase(),
      emailCanonical: canonicalEmail(dto.email),
      passwordHash: await hashPassword(dto.password),
      firstName: normalizeName(dto.firstName),
      lastName: normalizeName(dto.lastName),
      phone: dto.phone ? normalizePhone(dto.phone) : null,
      role: UserRole.Customer,
    }));
    return this.issueToken(user);
  }

  /** Mismo mensaje para correo inexistente, contraseña incorrecta o cuenta inactiva (evita enumerar usuarios). */
  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.findByEmail(dto.email);
    const passwordOk = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !passwordOk || !user.active) {
      logins.inc({ result: 'rechazado' });
      throw new UnauthorizedException('Correo o contraseña incorrectos');
    }
    logins.inc({ result: 'ok' });
    return this.issueToken(user);
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.users.findOneBy({ id: userId });
    if (!user || !user.active) throw new UnauthorizedException('La cuenta no existe o está inactiva');
    return toPublicUser(user);
  }

  // ── Panel de administración ───────────────────────────────────────────────
  /** Lista con el número de reservas de cada usuario (dato de ms-reservas; null si no respondió). */
  async list(ctx: AdminRequestContext) {
    const [users, usage] = await Promise.all([
      this.users.find({ order: { createdAt: 'DESC' } }),
      this.reservas.usage(ctx.authorization, ctx.correlationId),
    ]);
    return users.map((u) => ({
      ...this.safe(u),
      reservations: usage ? usage.get(u.id)?.reservations ?? 0 : null,
    }));
  }

  /** El administrador crea cuentas de clientes o de otros administradores, con una contraseña inicial. */
  async create(dto: CreateUserDto) {
    await this.assertEmailAvailable(dto.email);
    const user = await this.users.save(this.users.create({
      email: dto.email.trim().toLowerCase(),
      emailCanonical: canonicalEmail(dto.email),
      passwordHash: await hashPassword(dto.password),
      firstName: normalizeName(dto.firstName),
      lastName: normalizeName(dto.lastName),
      phone: dto.phone ? normalizePhone(dto.phone) : null,
      role: dto.role,
      active: true,
    }));
    return this.safe(user);
  }

  async update(id: string, dto: UpdateUserDto, actingUserId: string) {
    const user = await this.findUser(id);
    if (id === actingUserId && (dto.active === false || (dto.role && dto.role !== user.role))) {
      throw DomainError.conflict('No puedes quitarte el rol de administrador ni desactivar tu propia cuenta');
    }
    if (user.role === UserRole.Admin && (dto.active === false || (dto.role && dto.role !== UserRole.Admin))) {
      await this.assertAnotherActiveAdmin(id);
    }
    const changes: Partial<User> = {};
    if (dto.email !== undefined) {
      if (canonicalEmail(dto.email) !== user.emailCanonical) {
        await this.assertEmailAvailable(dto.email, id);
        changes.emailCanonical = canonicalEmail(dto.email);
      }
      changes.email = dto.email.trim().toLowerCase();
    }
    if (dto.firstName !== undefined) changes.firstName = normalizeName(dto.firstName);
    if (dto.lastName !== undefined) changes.lastName = normalizeName(dto.lastName);
    if (dto.phone !== undefined) changes.phone = dto.phone ? normalizePhone(dto.phone) : null;
    if (dto.role !== undefined) changes.role = dto.role;
    if (dto.active !== undefined) changes.active = dto.active;
    if (Object.keys(changes).length) await this.users.update(id, changes);
    return this.safe(await this.findUser(id));
  }

  /** Nueva contraseña definida por el administrador (p. ej. si el usuario la olvidó). */
  async resetPassword(id: string, dto: ResetPasswordDto) {
    await this.findUser(id);
    await this.users.update(id, { passwordHash: await hashPassword(dto.password) });
    return this.safe(await this.findUser(id));
  }

  /**
   * Solo se eliminan cuentas sin historial en ms-reservas (reservas, reseñas o bloqueos de flota); las demás se
   * desactivan para conservar la trazabilidad. Si ms-reservas no responde no se puede comprobar: no se elimina.
   */
  async remove(id: string, ctx: AdminRequestContext) {
    const user = await this.findUser(id);
    if (id === ctx.actingUserId) throw DomainError.conflict('No puedes eliminar tu propia cuenta');
    const usage = await this.reservas.usage(ctx.authorization, ctx.correlationId);
    if (!usage) {
      throw new DomainError(503, 'Servicio no disponible',
        'No se pudo consultar el historial del usuario en ms-reservas; inténtalo de nuevo en unos segundos');
    }
    const { reservations = 0, reviews = 0, blocks = 0 } = usage.get(id) ?? {};
    const history = [
      reservations && `${reservations} reserva(s)`,
      reviews && `${reviews} reseña(s)`,
      blocks && `${blocks} bloqueo(s) de flota`,
    ].filter(Boolean);
    if (history.length) {
      throw DomainError.conflict(`${user.email} tiene ${history.join(', ')}: desactiva la cuenta en lugar de eliminarla para conservar el historial`);
    }
    if (user.role === UserRole.Admin) await this.assertAnotherActiveAdmin(id);
    await this.users.delete(id);
  }

  // ── Auxiliares ────────────────────────────────────────────────────────────
  /** Busca por el correo canónico: "dan.iel@gmail.com" encuentra la cuenta "daniel@gmail.com". */
  private findByEmail(email: string): Promise<User | null> {
    return this.users.findOneBy({ emailCanonical: canonicalEmail(email) });
  }

  private async findUser(id: string): Promise<User> {
    const user = UUID.test(id) ? await this.users.findOneBy({ id }) : null;
    if (!user) throw DomainError.notFound('El usuario no existe');
    return user;
  }

  private safe(user: User) {
    const { passwordHash: _hidden, emailCanonical: _canonical, ...safe } = user;
    return safe;
  }

  /** Mismas reglas que el registro: en Gmail, puntos y "+etiqueta" no cuentan (correo canónico). */
  private async assertEmailAvailable(email: string, exceptUserId?: string) {
    const existing = await this.findByEmail(email);
    if (existing && existing.id !== exceptUserId) {
      throw DomainError.conflict(`Ya existe una cuenta con ese correo (${existing.email})`, [{ name: 'email', reason: 'ya registrado' }]);
    }
  }

  private async assertAnotherActiveAdmin(exceptUserId: string) {
    const others = await this.users.countBy({ role: UserRole.Admin, active: true, id: Not(exceptUserId) });
    if (others === 0) throw DomainError.conflict('Debe quedar al menos un administrador activo');
  }

  private async issueToken(user: User): Promise<AuthResult> {
    const accessToken = await this.tokens.sign({ sub: user.id, email: user.email, role: user.role });
    return { accessToken, tokenType: 'Bearer', user: toPublicUser(user) };
  }
}
