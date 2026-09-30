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

  async runOnce(): Promise<{ holdsExpired: number; idempotencyDeleted: number }> {
    const [, holdsExpired] = await this.dataSource.query(
      `UPDATE holds SET status = 'EXPIRED' WHERE status = 'HELD' AND expires_at <= now()`,
    );
    const [, idempotencyDeleted] = await this.dataSource.query(`DELETE FROM idempotency_records WHERE expires_at <= now()`);
    if (holdsExpired || idempotencyDeleted) {
      this.logger.log(`Mantenimiento: ${holdsExpired} holds expirados, ${idempotencyDeleted} claves de idempotencia eliminadas`);
    }
    return { holdsExpired, idempotencyDeleted };
  }
}
