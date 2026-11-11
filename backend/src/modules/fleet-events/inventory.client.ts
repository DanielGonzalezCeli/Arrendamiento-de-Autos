import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Lo que responde ms-inventario en /internal/stock. */
export interface InventoryOverview {
  mode: 'off' | 'grpc' | 'http';
  target: string | null;
  active: boolean;
  sync: { tracked: number; ok: number; failing: number; lastSyncedAt: string | null };
  pushes: unknown[];
  broker: { connected: boolean; exchange: string; queue: string; processed: number };
}

const TIMEOUT_MS = 3000;

/**
 * Lectura del estado del envío de stock en ms-inventario, para el panel /admin/booking. Se reenvía el token del
 * administrador. Si ms-inventario no responde, devuelve null y el panel muestra el resto.
 */
@Injectable()
export class InventoryClient {
  private readonly logger = new Logger(InventoryClient.name);
  private readonly baseUrl?: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('INVENTORY_URL')?.replace(/\/+$/, '');
  }

  async overview(authorization: string, correlationId?: string): Promise<InventoryOverview | null> {
    if (!this.baseUrl) return null;
    try {
      const headers: Record<string, string> = { Authorization: authorization, Accept: 'application/json' };
      if (correlationId) headers['X-Correlation-Id'] = correlationId;
      const res = await fetch(`${this.baseUrl}/internal/stock`, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as InventoryOverview;
    } catch (error) {
      this.logger.warn(`ms-inventario no respondió: ${(error as Error).message} cid=${correlationId ?? '-'}`);
      return null;
    }
  }
}
