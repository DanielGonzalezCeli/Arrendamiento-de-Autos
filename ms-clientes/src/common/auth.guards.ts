import { CanActivate, ExecutionContext, Injectable, Logger, OnModuleInit, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createPublicKey, timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { createLocalJWKSet, createRemoteJWKSet, exportJWK, jwtVerify, JWTVerifyGetKey } from 'jose';

/** Emisor y audiencia de los tokens de usuario de ms-identidad. */
const USER_JWT_ISSUER = 'rutalibre-identidad';
const USER_JWT_AUDIENCE = 'rutalibre-internal-api';

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/**
 * Credenciales que acepta ms-clientes:
 * - X-API-Key de Booking (contrato v3.1). ms-reservas la reenvía cuando vincula el cliente de una reserva de Booking.
 * - JWT de un ADMINISTRADOR emitido por ms-identidad (RS256, verificado con su JWKS). ms-reservas lo reenvía en las
 *   búsquedas del panel y del mostrador.
 * No hay un secreto propio entre servicios: cada llamada viaja con la credencial de quien la originó.
 */
@Injectable()
export class Credentials implements OnModuleInit {
  private readonly logger = new Logger(Credentials.name);
  private readonly apiKey: Buffer | null;
  private readonly failClosed: boolean;
  private keySource?: JWTVerifyGetKey;

  constructor(private readonly config: ConfigService) {
    const key = config.get<string>('BOOKING_API_KEY');
    this.apiKey = key ? digest(key) : null;
    this.failClosed = config.get<string>('NODE_ENV') === 'production';
    if (!key) {
      this.logger.warn(this.failClosed
        ? 'BOOKING_API_KEY no está definida: se rechazarán las peticiones con X-API-Key'
        : 'BOOKING_API_KEY no está definida: se aceptan peticiones sin X-API-Key (solo desarrollo)');
    }
  }

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

  /** null si no trae X-API-Key; true/false según sea válida. Sin clave configurada: abierta solo fuera de producción. */
  apiKeyValid(req: Request): boolean | null {
    const provided = req.header('x-api-key');
    if (!this.apiKey) return this.failClosed ? false : true;
    if (!provided) return null;
    return timingSafeEqual(digest(provided), this.apiKey);
  }

  /** Rol del token de usuario, o null si no trae uno. Lanza 401 si el token no es válido. */
  async userRole(req: Request): Promise<string | null> {
    const [scheme, token] = req.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) return null;
    if (!this.keySource) throw new UnauthorizedException('Este servicio no acepta tokens de usuario');
    try {
      const { payload } = await jwtVerify(token, this.keySource, { issuer: USER_JWT_ISSUER, audience: USER_JWT_AUDIENCE, algorithms: ['RS256'] });
      return payload.role as string;
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }
  }
}

/** Solo Booking (X-API-Key): las rutas del contrato v3.1. */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly credentials: Credentials) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.credentials.apiKeyValid(context.switchToHttp().getRequest<Request>()) !== true) {
      throw new UnauthorizedException('Falta la cabecera X-API-Key o no es válida');
    }
    return true;
  }
}

/** Rutas internas para ms-reservas: X-API-Key de Booking o token de un ADMIN (propagados por ms-reservas). */
@Injectable()
export class ServiceGuard implements CanActivate {
  constructor(private readonly credentials: Credentials) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const key = this.credentials.apiKeyValid(req);
    if (key === true && req.header('x-api-key')) return true;
    const role = await this.credentials.userRole(req);
    if (role === 'ADMIN') return true;
    if (role) throw new ForbiddenException('Solo un administrador puede consultar clientes');
    if (key === true) return true; // desarrollo sin clave configurada
    throw new UnauthorizedException('Se requiere X-API-Key o el token de un administrador');
  }
}
