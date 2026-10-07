import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource } from '@nestjs/typeorm';
import { Request } from 'express';
import { DataSource } from 'typeorm';
import { User } from '../../users/user.entity';
import { AuthUser, USER_JWT_AUDIENCE, USER_JWT_ISSUER, UserJwtPayload } from '../auth-user';

/**
 * Autenticación de USUARIOS WEB (API interna): exige "Authorization: Bearer <jwt>" emitido por
 * nuestro /api/auth/login. Es independiente de la autenticación entre sistemas (OAuth2 del Hub).
 *
 * Además del token, comprueba en la BD que la cuenta siga activa y toma su rol ACTUAL: si un administrador
 * desactiva una cuenta o le quita el rol, el cambio se aplica en la siguiente petición, sin esperar a que
 * el token expire.
 */
@Injectable()
export class UserJwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = this.extractBearer(request);
    if (!token) throw new UnauthorizedException('Falta el token de acceso');

    let payload: UserJwtPayload;
    try {
      payload = await this.jwt.verifyAsync<UserJwtPayload>(token, { issuer: USER_JWT_ISSUER, audience: USER_JWT_AUDIENCE });
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    const user = await this.dataSource.getRepository(User).findOne({
      where: { id: payload.sub }, select: { id: true, email: true, role: true, active: true },
    });
    if (!user || !user.active) throw new UnauthorizedException('La cuenta no existe o está desactivada');
    request.user = { id: user.id, email: user.email, role: user.role };
    return true;
  }

  private extractBearer(request: Request): string | undefined {
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    return scheme === 'Bearer' && token ? token : undefined;
  }
}
