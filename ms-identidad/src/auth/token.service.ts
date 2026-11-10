import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPrivateKey, createPublicKey, generateKeyPairSync, KeyObject } from 'crypto';
import { calculateJwkThumbprint, createLocalJWKSet, exportJWK, JWK, jwtVerify, JWTVerifyGetKey, SignJWT } from 'jose';
import { UserRole } from '../users/user.entity';

/** Emisor y audiencia de los JWT de usuario. ms-reservas exige los mismos valores al verificarlos. */
export const USER_JWT_ISSUER = 'rutalibre-identidad';
export const USER_JWT_AUDIENCE = 'rutalibre-internal-api';
const ALGORITHM = 'RS256';

export interface UserClaims {
  sub: string;
  email: string;
  role: UserRole;
}

/**
 * Firma de los JWT de usuario con RS256. Solo ms-identidad tiene la clave privada; los demás servicios
 * verifican con la clave pública que se publica en /.well-known/jwks.json, así que ningún otro servicio
 * puede emitir tokens ni necesita compartir un secreto.
 */
@Injectable()
export class TokenService implements OnModuleInit {
  private readonly logger = new Logger(TokenService.name);
  private readonly privateKey: KeyObject;
  private readonly expiresIn: string;
  private publicJwk!: JWK;
  private keySet!: JWTVerifyGetKey;

  constructor(config: ConfigService) {
    this.expiresIn = config.get<string>('USER_JWT_EXPIRES_IN') ?? '2h';
    const pem = config.get<string>('IDENTITY_JWT_PRIVATE_KEY');
    if (pem) {
      this.privateKey = createPrivateKey(pem.replace(/\\n/g, '\n'));
    } else if (config.get('NODE_ENV') === 'production') {
      throw new Error('IDENTITY_JWT_PRIVATE_KEY es obligatoria en producción');
    } else {
      this.logger.warn('IDENTITY_JWT_PRIVATE_KEY no definida: se usa una clave efímera (las sesiones se pierden al reiniciar).');
      this.privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    }
  }

  async onModuleInit(): Promise<void> {
    const jwk = await exportJWK(createPublicKey(this.privateKey));
    this.publicJwk = { ...jwk, kid: await calculateJwkThumbprint(jwk), alg: ALGORITHM, use: 'sig' };
    this.keySet = createLocalJWKSet({ keys: [this.publicJwk] });
  }

  jwks(): { keys: JWK[] } {
    return { keys: [this.publicJwk] };
  }

  sign(claims: UserClaims): Promise<string> {
    return new SignJWT({ email: claims.email, role: claims.role })
      .setProtectedHeader({ alg: ALGORITHM, kid: this.publicJwk.kid, typ: 'JWT' })
      .setIssuer(USER_JWT_ISSUER)
      .setAudience(USER_JWT_AUDIENCE)
      .setSubject(claims.sub)
      .setIssuedAt()
      .setExpirationTime(this.expiresIn)
      .sign(this.privateKey);
  }

  /** Verifica firma, emisor, audiencia y expiración. Lanza si el token no es válido. */
  async verify(token: string): Promise<UserClaims> {
    const { payload } = await jwtVerify(token, this.keySet, { issuer: USER_JWT_ISSUER, audience: USER_JWT_AUDIENCE, algorithms: [ALGORITHM] });
    return { sub: payload.sub!, email: payload.email as string, role: payload.role as UserRole };
  }
}
