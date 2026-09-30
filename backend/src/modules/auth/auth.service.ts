import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { DomainError, ProblemCode } from '../../domain/domain-error';
import { User } from '../users/user.entity';
import { PublicUser, toPublicUser, UsersService } from '../users/users.service';
import { UserJwtPayload } from './auth-user';
import { LoginDto, RegisterDto } from './dto/auth.dto';

const BCRYPT_COST = 12;
/** Se compara cuando el correo no existe, para que la respuesta tarde lo mismo y no revele qué correos están registrados. */
const DUMMY_HASH = bcrypt.hashSync('dummy-password-never-used', BCRYPT_COST);

export interface AuthResult {
  accessToken: string;
  tokenType: 'Bearer';
  user: PublicUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    if (await this.users.findByEmail(dto.email)) {
      throw new DomainError(ProblemCode.ValidationFailed, 409, 'Conflicto', 'Ya existe una cuenta con ese correo', [
        { name: 'email', reason: 'ya registrado' },
      ]);
    }
    const user = await this.users.createCustomer({
      email: dto.email,
      passwordHash: await bcrypt.hash(dto.password, BCRYPT_COST),
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone ?? null,
    });
    return this.issueToken(user);
  }

  /** Mismo mensaje para correo inexistente, contraseña incorrecta o cuenta inactiva (evita enumerar usuarios). */
  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.users.findByEmail(dto.email);
    const passwordOk = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !passwordOk || !user.active) {
      throw new UnauthorizedException('Correo o contraseña incorrectos');
    }
    return this.issueToken(user);
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.users.findById(userId);
    if (!user || !user.active) throw new UnauthorizedException('La cuenta no existe o está inactiva');
    return toPublicUser(user);
  }

  private async issueToken(user: User): Promise<AuthResult> {
    const payload: UserJwtPayload = { sub: user.id, email: user.email, role: user.role };
    return { accessToken: await this.jwt.signAsync(payload), tokenType: 'Bearer', user: toPublicUser(user) };
  }
}
