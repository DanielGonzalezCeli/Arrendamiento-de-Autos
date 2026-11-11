import { CanActivate, ExecutionContext, ForbiddenException, Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPublicKey } from 'crypto';
import { Request } from 'express';
import { createLocalJWKSet, createRemoteJWKSet, exportJWK, jwtVerify, JWTVerifyGetKey } from 'jose';

/**
 * API interna (la consume ms-reservas para el panel /admin/booking): exige el token de un ADMINISTRADOR emitido por
 * ms-identidad, que ms-reservas reenvía. Se verifica con la clave pública de ms-identidad (RS256, JWKS).
 */
@Injectable()
export class AdminGuard implements CanActivate, OnModuleInit {
  private keySource?: JWTVerifyGetKey;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const pem = this.config.get<string>('IDENTITY_JWT_PUBLIC_KEY')?.replace(/\\n/g, '\n');
    const identityUrl = this.config.get<string>('IDENTITY_URL')?.replace(/\/+$/, '');
    if (pem) {
      const jwk = await exportJWK(createPublicKey(pem));
      this.keySource = createLocalJWKSet({ keys: [{ ...jwk, alg: 'RS256' }] });
    } else if (identityUrl) {
      this.keySource = createRemoteJWKSet(new URL(`${identityUrl}/.well-known/jwks.json`), { cooldownDuration: 30_000 });
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const [scheme, token] = req.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token || !this.keySource) throw new UnauthorizedException('Se requiere el token de un administrador');
    let role: unknown;
    try {
      ({ payload: { role } } = await jwtVerify(token, this.keySource, {
        issuer: 'rutalibre-identidad', audience: 'rutalibre-internal-api', algorithms: ['RS256'],
      }));
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }
    if (role !== 'ADMIN') throw new ForbiddenException('Solo un administrador puede ver el estado del stock');
    return true;
  }
}
