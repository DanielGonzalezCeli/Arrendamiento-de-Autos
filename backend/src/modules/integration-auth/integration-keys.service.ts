import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPrivateKey, createPublicKey, generateKeyPairSync, KeyObject } from 'crypto';
import {
  calculateJwkThumbprint, createLocalJWKSet, createRemoteJWKSet, exportJWK, JWK, jwtVerify, JWTPayload, JWTVerifyGetKey, SignJWT,
} from 'jose';

export const INTEGRATION_ALGORITHM = 'RS256';

/**
 * Claves y verificación de los tokens OAuth2 de la API de integración (RS256, confirmado).
 * - RDA2: INTEGRATION_JWKS_URL apunta al JWKS del IdP central → solo se verifica.
 * - RDA1: LOCAL_OAUTH_ISSUER_ENABLED=true → este servicio también firma tokens (emisor local) y publica
 *   su JWKS en /.well-known/jwks.json. Si no hay LOCAL_OAUTH_PRIVATE_KEY se genera una clave efímera.
 */
@Injectable()
export class IntegrationKeysService implements OnModuleInit {
  private readonly logger = new Logger(IntegrationKeysService.name);
  private privateKey?: KeyObject;
  private publicJwk?: JWK;
  private keySource?: JWTVerifyGetKey;

  readonly issuer: string;
  readonly audience: string;
  readonly tokenTtlSeconds: number;
  readonly localIssuerEnabled: boolean;
  private readonly jwksUrl?: string;

  constructor(config: ConfigService) {
    this.issuer = config.get<string>('INTEGRATION_JWT_ISSUER');
    this.audience = config.get<string>('INTEGRATION_JWT_AUDIENCE');
    this.tokenTtlSeconds = config.get<number>('INTEGRATION_TOKEN_TTL_SECONDS');
    this.localIssuerEnabled = config.get<boolean>('LOCAL_OAUTH_ISSUER_ENABLED');
    this.jwksUrl = config.get<string>('INTEGRATION_JWKS_URL');
    const pem = config.get<string>('LOCAL_OAUTH_PRIVATE_KEY');
    if (this.localIssuerEnabled) this.privateKey = pem ? createPrivateKey(pem.replace(/\\n/g, '\n')) : this.ephemeralKey();
  }

  async onModuleInit(): Promise<void> {
    if (this.privateKey) {
      const jwk = await exportJWK(createPublicKey(this.privateKey));
      this.publicJwk = { ...jwk, kid: await calculateJwkThumbprint(jwk), alg: INTEGRATION_ALGORITHM, use: 'sig' };
    }
    if (this.jwksUrl) this.keySource = createRemoteJWKSet(new URL(this.jwksUrl));
    else if (this.publicJwk) this.keySource = createLocalJWKSet({ keys: [this.publicJwk] });
    else this.logger.warn('Sin JWKS ni emisor local: la API de integración rechazará todos los tokens.');
  }

  /** JWKS público del emisor local. */
  jwks(): { keys: JWK[] } {
    return { keys: this.publicJwk ? [this.publicJwk] : [] };
  }

  /** Firma un access token (solo emisor local). Scopes como array en el claim `scopes` (confirmado). */
  async sign(subject: string, scopes: string[], extraClaims: JWTPayload = {}): Promise<string> {
    if (!this.privateKey || !this.publicJwk) throw new Error('El emisor OAuth2 local está deshabilitado');
    return new SignJWT({ ...extraClaims, scopes, scope: scopes.join(' ') })
      .setProtectedHeader({ alg: INTEGRATION_ALGORITHM, kid: this.publicJwk.kid, typ: 'at+jwt' })
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setSubject(subject)
      .setIssuedAt()
      .setExpirationTime(`${this.tokenTtlSeconds}s`)
      .sign(this.privateKey);
  }

  /** Verifica firma, emisor, audiencia y expiración. Lanza si el token no es válido. */
  async verify(token: string): Promise<JWTPayload> {
    if (!this.keySource) throw new Error('No hay claves de verificación configuradas');
    const { payload } = await jwtVerify(token, this.keySource, {
      issuer: this.issuer,
      audience: this.audience,
      algorithms: [INTEGRATION_ALGORITHM],
    });
    return payload;
  }

  private ephemeralKey(): KeyObject {
    this.logger.warn('LOCAL_OAUTH_PRIVATE_KEY no definida: se usa una clave efímera (los tokens dejan de valer al reiniciar).');
    return generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  }
}

/** Extrae los scopes de un JWT: `scopes` (array, acordado con integración), `scp` (array) o `scope` (string RFC 9068). */
export function scopesFromPayload(payload: JWTPayload): string[] {
  const { scopes, scp, scope } = payload as { scopes?: unknown; scp?: unknown; scope?: unknown };
  if (Array.isArray(scopes)) return scopes.map(String);
  if (Array.isArray(scp)) return scp.map(String);
  if (typeof scope === 'string') return scope.split(' ').filter(Boolean);
  return [];
}
