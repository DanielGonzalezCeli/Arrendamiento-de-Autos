import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AuthUser } from '../auth-user';
import { IdentityClient } from '../identity-client';

/**
 * Autenticación de USUARIOS WEB (API interna): exige "Authorization: Bearer <jwt>" emitido por ms-identidad
 * (/api/auth/login). Es independiente de la autenticación entre sistemas (OAuth2 / X-API-Key de Booking).
 *
 * Además de verificar el token, pregunta a ms-identidad si la cuenta sigue activa y toma su rol ACTUAL: si un
 * administrador desactiva una cuenta o le quita el rol, el cambio se aplica en la siguiente petición, sin esperar
 * a que el token expire.
 */
@Injectable()
export class UserJwtGuard implements CanActivate {
  constructor(private readonly identity: IdentityClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Falta el token de acceso');

    let claims;
    try {
      claims = await this.identity.verify(token);
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    const status = await this.identity.status(token, request.headers['x-correlation-id'] as string | undefined);
    if (status.kind === 'rejected') throw new UnauthorizedException('La cuenta no existe o está desactivada');
    request.user = status.kind === 'active'
      ? { id: claims.sub, email: status.email, role: status.role }
      : { id: claims.sub, email: claims.email, role: claims.role };
    return true;
  }
}
