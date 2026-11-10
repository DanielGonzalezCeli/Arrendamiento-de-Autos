import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPublicKey } from 'crypto';
import { createLocalJWKSet, createRemoteJWKSet, exportJWK, jwtVerify, JWTVerifyGetKey } from 'jose';
import { UserRole } from '../../domain/enums';
import { USER_JWT_AUDIENCE, USER_JWT_ISSUER, UserJwtPayload } from './auth-user';

const STATUS_TIMEOUT_MS = 3000;

/** Estado actual de la cuenta según ms-identidad. */
export type AccountStatus = { kind: 'active'; email: string; role: UserRole } | { kind: 'rejected' } | { kind: 'unknown' };

/**
 * Integración con ms-identidad, dueño de los usuarios (fase B). ms-reservas ya no tiene la tabla de usuarios ni
 * firma tokens:
 * - verify(): comprueba el JWT RS256 con la clave PÚBLICA de ms-identidad (su JWKS; jose la guarda en caché y la
 *   vuelve a pedir si aparece un "kid" nuevo). En los tests se usa IDENTITY_JWT_PUBLIC_KEY en lugar del JWKS.
 * - status(): pregunta a ms-identidad (/api/auth/me con el mismo token) si la cuenta sigue activa y su rol actual,
 *   para que desactivar una cuenta o quitarle el rol de ADMIN aplique en la siguiente petición.
 */
@Injectable()
export class IdentityClient implements OnModuleInit {
  private readonly logger = new Logger(IdentityClient.name);
  private readonly identityUrl?: string;
  private readonly publicKeyPem?: string;
  private keySource?: JWTVerifyGetKey;

  constructor(config: ConfigService) {
    this.identityUrl = config.get<string>('IDENTITY_URL')?.replace(/\/+$/, '');
    this.publicKeyPem = config.get<string>('IDENTITY_JWT_PUBLIC_KEY')?.replace(/\\n/g, '\n');
  }

  async onModuleInit(): Promise<void> {
    if (this.publicKeyPem) {
      const jwk = await exportJWK(createPublicKey(this.publicKeyPem));
      this.keySource = createLocalJWKSet({ keys: [{ ...jwk, alg: 'RS256' }] });
    } else if (this.identityUrl) {
      this.keySource = createRemoteJWKSet(new URL(`${this.identityUrl}/.well-known/jwks.json`), { cooldownDuration: 30_000 });
    } else {
      this.logger.error('Sin IDENTITY_URL ni IDENTITY_JWT_PUBLIC_KEY: se rechazarán todos los tokens de usuario.');
    }
  }

  /** Verifica firma (solo RS256), emisor, audiencia y expiración. Lanza si el token no es válido. */
  async verify(token: string): Promise<UserJwtPayload> {
    if (!this.keySource) throw new Error('No hay clave de ms-identidad configurada');
    const { payload } = await jwtVerify(token, this.keySource, { issuer: USER_JWT_ISSUER, audience: USER_JWT_AUDIENCE, algorithms: ['RS256'] });
    return { sub: payload.sub!, email: payload.email as string, role: payload.role as UserRole };
  }

  /**
   * "unknown" si ms-identidad no está configurado o no respondió: quien llama usa entonces los datos del token
   * (firmado y con expiración corta), para que una caída de ms-identidad no deje fuera a quien ya inició sesión.
   */
  async status(token: string, correlationId?: string): Promise<AccountStatus> {
    if (!this.identityUrl) return { kind: 'unknown' };
    try {
      const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
      if (correlationId) headers['X-Correlation-Id'] = correlationId;
      const res = await fetch(`${this.identityUrl}/api/auth/me`, { headers, signal: AbortSignal.timeout(STATUS_TIMEOUT_MS) });
      if (res.status === 401 || res.status === 403) return { kind: 'rejected' };
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const me = (await res.json()) as { email: string; role: UserRole };
      return { kind: 'active', email: me.email, role: me.role };
    } catch (error) {
      this.logger.warn(`ms-identidad no respondió; se usan los datos del token: ${(error as Error).message}`);
      return { kind: 'unknown' };
    }
  }
}
