import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { StockSyncService } from '../stock/stock-sync.service';
import { parseFleetEvent } from './fleet-event';

const RECONNECT_MS = 5_000;
/** Si aplicar un evento falla por un error transitorio (p. ej. la BD), se devuelve a la cola tras esta espera. */
const RETRY_DELAY_MS = 2_000;

/**
 * Consumidor de los eventos de flota (RabbitMQ). Topología, declarada por este servicio de forma idempotente:
 *   exchange <AMQP_EXCHANGE> (topic, durable) ──flota.*──► cola <AMQP_QUEUE> (durable)
 *   mensajes inválidos ──► exchange <AMQP_EXCHANGE>.dlx ──► cola <AMQP_QUEUE>.dlq (para revisarlos a mano)
 * Confirmación manual (ack) después de aplicar el evento, de a uno (prefetch 1): si el servicio se cae a mitad,
 * el mensaje vuelve a la cola. Si se pierde la conexión, reintenta cada 5 s; los eventos esperan en la cola.
 */
@Injectable()
export class FleetEventsConsumer implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(FleetEventsConsumer.name);
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;
  private stopped = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  readonly exchange: string;
  readonly queue: string;
  /** Eventos procesados desde el arranque (diagnóstico en /health). */
  processed = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly stock: StockSyncService,
  ) {
    this.exchange = config.get<string>('AMQP_EXCHANGE')!;
    this.queue = config.get<string>('AMQP_QUEUE')!;
  }

  get connected(): boolean {
    return this.channel !== null;
  }

  onApplicationBootstrap(): void {
    if (!this.config.get<string>('AMQP_URL')) {
      this.logger.warn('AMQP_URL no definida: no se consumen eventos de flota');
      return;
    }
    void this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    await this.connection?.close().catch(() => undefined);
  }

  private async connect(): Promise<void> {
    try {
      const connection = await amqp.connect(this.config.get<string>('AMQP_URL')!, { clientProperties: { connection_name: 'ms-inventario' } });
      connection.on('error', (error) => this.logger.warn(`RabbitMQ: ${error.message}`));
      connection.on('close', () => this.scheduleReconnect('conexión cerrada'));
      const channel = await connection.createChannel();
      await channel.assertExchange(this.exchange, 'topic', { durable: true });
      await channel.assertExchange(`${this.exchange}.dlx`, 'fanout', { durable: true });
      await channel.assertQueue(`${this.queue}.dlq`, { durable: true });
      await channel.bindQueue(`${this.queue}.dlq`, `${this.exchange}.dlx`, '');
      await channel.assertQueue(this.queue, { durable: true, arguments: { 'x-dead-letter-exchange': `${this.exchange}.dlx` } });
      await channel.bindQueue(this.queue, this.exchange, 'flota.*');
      await channel.prefetch(1);
      await channel.consume(this.queue, (message) => void this.handle(channel, message), { noAck: false });
      this.connection = connection;
      this.channel = channel;
      this.logger.log(`Escuchando ${this.exchange} → ${this.queue} (flota.*)`);
    } catch (error) {
      this.scheduleReconnect((error as Error).message);
    }
  }

  private scheduleReconnect(reason: string): void {
    this.channel = null;
    this.connection = null;
    if (this.stopped || this.reconnectTimer) return;
    this.logger.warn(`RabbitMQ no disponible (${reason}); reintento en ${RECONNECT_MS / 1000} s`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, RECONNECT_MS);
    this.reconnectTimer.unref();
  }

  private async handle(channel: amqp.Channel, message: amqp.ConsumeMessage | null): Promise<void> {
    if (!message) return; // la cola fue eliminada: se reconecta solo
    const parsed = parseFleetEvent(message.content.toString('utf8'));
    if ('error' in parsed) {
      this.logger.warn(`Evento inválido enviado a ${this.queue}.dlq: ${parsed.error}`);
      channel.nack(message, false, false);
      return;
    }
    const { event } = parsed;
    try {
      const summary = await this.stock.apply(event.data.vehicles, new Date(event.time), event.correlationid);
      this.processed++;
      if (event.type.endsWith('estado_cambiado')) {
        this.logger.log(`${message.fields.routingKey} ${event.data.vehicles.map((v) => `${v.vehicle_id}=${v.state}`).join(', ')} → ${summary.pushed} enviados cid=${event.correlationid}`);
      }
      channel.ack(message);
    } catch (error) {
      this.logger.error(`No se pudo aplicar ${event.type} ${event.id}: ${(error as Error).message}; vuelve a la cola`);
      setTimeout(() => channel.nack(message, false, true), RETRY_DELAY_MS).unref();
    }
  }
}
