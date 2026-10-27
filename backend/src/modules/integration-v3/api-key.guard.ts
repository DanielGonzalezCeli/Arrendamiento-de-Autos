import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'crypto';
import { Request } from 'express';

/**
 * ApiKeyAuth del contrato v3: Booking envía X-API-Key en las operaciones que modifican datos o exponen
 * datos de clientes. La comparación es en tiempo constante (sobre el hash, para no filtrar la longitud).
 * Si BOOKING_API_KEY no está definida, las rutas quedan abiertas (solo para desarrollo) y se avisa al arrancar.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private static warned = false;
  private readonly expected: Buffer | null;

  constructor(config: ConfigService) {
    const key = config.get<string>('BOOKING_API_KEY');
    this.expected = key ? digest(key) : null;
    if (!key && !ApiKeyGuard.warned) {
      ApiKeyGuard.warned = true;
      new Logger(ApiKeyGuard.name).warn('BOOKING_API_KEY no está definida: las rutas v3 protegidas aceptan peticiones sin X-API-Key');
    }
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.expected) return true;
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
