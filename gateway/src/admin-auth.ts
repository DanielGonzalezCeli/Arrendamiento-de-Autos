import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { createPublicKey } from 'crypto';
import { Request } from 'express';
import { createLocalJWKSet, createRemoteJWKSet, exportJWK, jwtVerify, JWTVerifyGetKey } from 'jose';

import { GatewayConfig } from './config';
import { GATEWAY_CONFIG } from './health.controller';

/**
 * Solo ADMIN: el token de usuario de ms-identidad (RS256), verificado con su clave PÚBLICA. El gateway sigue sin
 * secretos: el JWKS de ms-identidad es público.
 */
@Injectable()
export class AdminGuard implements CanActivate, OnModuleInit {
  /** Sin ms-identidad configurado no hay con qué verificar: se rechaza todo. */
  private keySource?: JWTVerifyGetKey;

  constructor(@Inject(GATEWAY_CONFIG) private readonly config: GatewayConfig) {}

  async onModuleInit(): Promise<void> {
    if (this.config.identityPublicKey) {
      const jwk = await exportJWK(createPublicKey(this.config.identityPublicKey.replace(/\\n/g, '\n')));
      this.keySource = createLocalJWKSet({ keys: [{ ...jwk, alg: 'RS256' }] });
    } else if (this.config.services['ms-identidad']) {
      this.keySource = createRemoteJWKSet(new URL(`${this.config.services['ms-identidad']}/.well-known/jwks.json`), { cooldownDuration: 30_000 });
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const [scheme, token] = context.switchToHttp().getRequest<Request>().headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token || !this.keySource) throw new UnauthorizedException('Se requiere el token de un administrador');
    let role: unknown;
    try {
      ({ payload: { role } } = await jwtVerify(token, this.keySource, {
        issuer: 'rutalibre-identidad', audience: 'rutalibre-internal-api', algorithms: ['RS256'],
      }));
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }
    if (role !== 'ADMIN') throw new ForbiddenException('Solo un administrador puede ver las métricas');
    return true;
  }
}
