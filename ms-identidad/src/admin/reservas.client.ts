import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Historial de un usuario en ms-reservas. */
export interface UserUsage {
  reservations: number;
  reviews: number;
  blocks: number;
}

const TIMEOUT_MS = 5000;

/**
 * Cliente HTTP hacia ms-reservas (llamada directa entre servicios, sin pasar por el gateway). Las reservas,
 * reseñas y bloqueos de flota son datos de ms-reservas: ms-identidad no los lee de la BD, los pide por API.
 * Propaga el token del administrador (ms-reservas exige rol ADMIN) y el X-Correlation-Id para la traza.
 */
@Injectable()
export class ReservasClient {
  private readonly logger = new Logger(ReservasClient.name);
  private readonly baseUrl?: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('MS_RESERVAS_URL')?.replace(/\/+$/, '');
  }

  /** Historial por id de usuario, o null si ms-reservas no responde (quien llama decide cómo degradar). */
  async usage(authorization: string, correlationId?: string): Promise<Map<string, UserUsage> | null> {
    if (!this.baseUrl) return null;
    try {
      const headers: Record<string, string> = { Authorization: authorization, Accept: 'application/json' };
      if (correlationId) headers['X-Correlation-Id'] = correlationId;
      const res = await fetch(`${this.baseUrl}/api/admin/user-usage`, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = (await res.json()) as (UserUsage & { userId: string })[];
      return new Map(rows.map(({ userId, ...usage }) => [userId, usage]));
    } catch (error) {
      this.logger.warn(`ms-reservas no respondió el historial de usuarios: ${(error as Error).message}`);
      return null;
    }
  }
}
