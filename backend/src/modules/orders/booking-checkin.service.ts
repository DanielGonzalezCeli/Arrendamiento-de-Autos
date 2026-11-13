import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BookingCheckin } from './entities/booking-checkin.entity';

const BATCH = 50;

/**
 * Despachador del outbox de check-in (contrato v3.1): POST {BOOKING_CHECKIN_URL} con X-API-Key y el
 * X-Correlation-Id de la entrega. Se intenta en cuanto el mostrador confirma y, si Booking no responde 2xx,
 * se reintenta cada BOOKING_CHECKIN_RETRY_MS. Con BOOKING_NOTIFY_MODE=off los avisos quedan pendientes.
 */
@Injectable()
export class BookingCheckinService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(BookingCheckinService.name);
  private timer: NodeJS.Timeout | null = null;
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly config: ConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  get enabled(): boolean {
    return this.config.get<string>('BOOKING_NOTIFY_MODE') === 'http';
  }

  onApplicationBootstrap(): void {
    if (!this.enabled) {
      this.logger.log('Check-in hacia Booking desactivado (BOOKING_NOTIFY_MODE=off): los avisos quedan pendientes');
      return;
    }
    this.logger.log(`Check-in hacia Booking por http → ${this.config.get<string>('BOOKING_CHECKIN_URL')}`);
    const interval = this.config.get<number>('BOOKING_CHECKIN_RETRY_MS') ?? 30_000;
    if (interval > 0) {
      this.timer = setInterval(() => void this.dispatchPending(), interval);
      this.timer.unref();
    }
    void this.dispatchPending();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Aviso inmediato tras la entrega. Nunca lanza: si falla, queda pendiente para la próxima vuelta. */
  async dispatch(reservationId: string): Promise<void> {
    if (!this.enabled) return;
    const row = await this.dataSource.getRepository(BookingCheckin).findOneBy({ reservationId, status: 'PENDING' });
    if (row) await this.send(row);
  }

  async dispatchPending(): Promise<void> {
    try {
      const rows = await this.dataSource.getRepository(BookingCheckin).find({ where: { status: 'PENDING' }, order: { createdAt: 'ASC' }, take: BATCH });
      for (const row of rows) await this.send(row);
    } catch (error) {
      this.logger.warn(`No se pudieron leer los check-in pendientes: ${(error as Error).message}`);
    }
  }

  private async send(row: BookingCheckin): Promise<void> {
    if (this.inFlight.has(row.reservationId)) return;
    this.inFlight.add(row.reservationId);
    const url = this.config.get<string>('BOOKING_CHECKIN_URL')!.replace('{external_order_id}', encodeURIComponent(row.locator));
    const apiKey = this.config.get<string>('BOOKING_API_KEY');
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Correlation-Id': row.correlationId, ...(apiKey ? { 'X-API-Key': apiKey } : {}) },
        body: JSON.stringify(row.payload),
        signal: AbortSignal.timeout(this.config.get<number>('BOOKING_CHECKIN_TIMEOUT_MS') ?? 15_000),
      });
      const raw = await response.text().catch(() => '');
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${raw.slice(0, 250) || response.statusText}`);
      let ack: { status?: unknown } = {};
      try {
        ack = JSON.parse(raw) as { status?: unknown };
      } catch {
        // 2xx sin JSON: se da por recibido
      }
      const acknowledged = typeof ack.status === 'string' ? ack.status.slice(0, 40) : 'OK';
      await this.dataSource.getRepository(BookingCheckin).update(row.reservationId, {
        status: 'SENT', attempts: row.attempts + 1, lastError: null, acknowledgedStatus: acknowledged, sentAt: new Date(),
      });
      this.logger.log(`Check-in ${row.locator} notificado a Booking → ${response.status} ${acknowledged} cid=${row.correlationId}`);
    } catch (error) {
      const message = (error as Error).message.slice(0, 300);
      await this.dataSource.getRepository(BookingCheckin).update(row.reservationId, { attempts: row.attempts + 1, lastError: message });
      if (row.attempts === 0) this.logger.warn(`Check-in ${row.locator} no llegó a Booking (${message}) — se reintentará cid=${row.correlationId}`);
    } finally {
      this.inFlight.delete(row.reservationId);
    }
  }
}
