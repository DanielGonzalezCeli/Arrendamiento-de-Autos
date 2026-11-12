import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Tareas periódicas de limpieza. No cambian reglas de negocio (un hold vencido ya no cuenta como
 * ocupado aunque siga en HELD, porque la disponibilidad compara expires_at), solo dejan el estado explícito
 * y evitan que las tablas crezcan sin límite.
 */
@Injectable()
export class MaintenanceService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(MaintenanceService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    const intervalMs = Number(this.config.get('MAINTENANCE_INTERVAL_MS') ?? 600_000);
    if (intervalMs > 0) this.timer = setInterval(() => void this.runOnce().catch((e) => this.logger.error(e.message)), intervalMs);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async runOnce(): Promise<{ holdsExpired: number; idempotencyDeleted: number; searchesDeleted: number }> {
    const [, holdsExpired] = await this.dataSource.query(
      `UPDATE holds SET status = 'EXPIRED' WHERE status = 'HELD' AND expires_at <= now()`,
    );
    const [, idempotencyDeleted] = await this.dataSource.query(`DELETE FROM idempotency_records WHERE expires_at <= now()`);
    // La web refresca la búsqueda cada pocos segundos (stock en vivo): se borran las sesiones vencidas que no usó
    // ningún hold ni preview (esas quedan como historial de la venta).
    const [, searchesDeleted] = await this.dataSource.query(
      `DELETE FROM search_sessions s WHERE s.expires_at <= now()
          AND NOT EXISTS (SELECT 1 FROM holds h WHERE h.search_session_id = s.id)
          AND NOT EXISTS (SELECT 1 FROM order_previews p WHERE p.search_session_id = s.id)`,
    );
    if (holdsExpired || idempotencyDeleted || searchesDeleted) {
      this.logger.log(`Mantenimiento: ${holdsExpired} holds expirados, ${idempotencyDeleted} claves de idempotencia y ${searchesDeleted} búsquedas vencidas eliminadas`);
    }
    return { holdsExpired, idempotencyDeleted, searchesDeleted };
  }
}
