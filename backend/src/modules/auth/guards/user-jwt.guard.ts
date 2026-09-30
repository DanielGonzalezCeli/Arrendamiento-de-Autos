import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { AuthUser, USER_JWT_AUDIENCE, USER_JWT_ISSUER, UserJwtPayload } from '../auth-user';

/**
 * Autenticación de USUARIOS WEB (API interna): exige "Authorization: Bearer <jwt>" emitido por
 * nuestro /api/auth/login. Es independiente de la autenticación entre sistemas (OAuth2 del Hub).
 */
@Injectable()
export class UserJwtGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = this.extractBearer(request);
    if (!token) throw new UnauthorizedException('Falta el token de acceso');

    try {
      const payload = await this.jwt.verifyAsync<UserJwtPayload>(token, {
        issuer: USER_JWT_ISSUER,
        audience: USER_JWT_AUDIENCE,
      });
      request.user = { id: payload.sub, email: payload.email, role: payload.role };
      return true;
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }
  }

  private extractBearer(request: Request): string | undefined {
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    return scheme === 'Bearer' && token ? token : undefined;
  }
}
