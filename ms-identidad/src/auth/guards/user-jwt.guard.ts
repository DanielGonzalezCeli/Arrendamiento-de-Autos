import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { Repository } from 'typeorm';
import { User, UserRole } from '../../users/user.entity';
import { TokenService } from '../token.service';

/** Usuario autenticado (adjuntado a request.user). */
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

/**
 * Exige "Authorization: Bearer <jwt>" firmado por este servicio. Además del token, comprueba en la BD que la
 * cuenta siga activa y toma su rol ACTUAL: desactivar una cuenta o quitarle el rol aplica en la siguiente petición.
 */
@Injectable()
export class UserJwtGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Falta el token de acceso');

    let sub: string;
    try {
      sub = (await this.tokens.verify(token)).sub;
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    const user = await this.users.findOne({ where: { id: sub }, select: { id: true, email: true, role: true, active: true } });
    if (!user || !user.active) throw new UnauthorizedException('La cuenta no existe o está desactivada');
    request.user = { id: user.id, email: user.email, role: user.role };
    return true;
  }
}
