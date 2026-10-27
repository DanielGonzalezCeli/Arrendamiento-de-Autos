import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'crypto';
import { Request } from 'express';

/**
 * ApiKeyAuth del contrato v3: Booking envía X-API-Key en las operaciones que modifican datos o exponen
 * datos de clientes. La comparación es en tiempo constante (sobre el hash, para no filtrar la longitud).
 * Si BOOKING_API_KEY no está definida: en desarrollo las rutas quedan abiertas (con un aviso); en producción
 * se rechazan, para que un olvido de configuración nunca deje abiertas las reservas.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private static warned = false;
  private readonly expected: Buffer | null;
  private readonly failClosed: boolean;

  constructor(config: ConfigService) {
    const key = config.get<string>('BOOKING_API_KEY');
    this.expected = key ? digest(key) : null;
    this.failClosed = config.get<string>('NODE_ENV') === 'production';
    if (!key && !ApiKeyGuard.warned) {
      ApiKeyGuard.warned = true;
      new Logger(ApiKeyGuard.name).warn(this.failClosed
        ? 'BOOKING_API_KEY no está definida: las rutas v3 protegidas rechazarán todas las peticiones'
        : 'BOOKING_API_KEY no está definida: las rutas v3 protegidas aceptan peticiones sin X-API-Key (solo desarrollo)');
    }
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.expected) {
      if (this.failClosed) throw new UnauthorizedException('La tienda aún no tiene configurada la clave de API para Booking');
      return true;
    }
    const provided = context.switchToHttp().getRequest<Request>().header('x-api-key');
    if (!provided || !timingSafeEqual(digest(provided), this.expected)) {
      throw new UnauthorizedException('Falta la cabecera X-API-Key o no es válida');
    }
    return true;
  }
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}
