import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Límite de peticiones por afiliado (+ IP) en la API de integración → 429 RATE_LIMIT_EXCEEDED.
 * La clave incluye X-Affiliate-Id para que un afiliado no consuma la cuota de otro.
 */
@Injectable()
export class IntegrationThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(request: Record<string, any>): Promise<string> {
    return `affiliate:${request.headers?.['x-affiliate-id'] ?? 'none'}|ip:${request.ip}`;
  }
}
