import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { randomUUID } from 'crypto';

const RECONNECT_MS = 5_000;
/** Eventos que se guardan en memoria cuando no hay broker (desarrollo y tests). */
const MEMORY_LIMIT = 500;

/** Sobre CloudEvents 1.0 (mismo formato que los eventos del contrato v3). */
export interface BusEvent<T = unknown> {
  specversion: '1.0';
  id: string;
  type: string;
  source: 'ms-reservas';
  time: string;
  correlationid: string;
  datacontenttype: 'application/json';
  data: T;
}

export interface PublishedEvent {
  routingKey: string;
  event: BusEvent;
}

/**
 * Publicador de eventos de dominio en RabbitMQ (exchange topic durable, mensajes persistentes y con confirmación del
 * broker). Si AMQP_URL no está definida (desarrollo, tests) los eventos quedan en memoria para inspeccionarlos.
 *
 * Si el broker no está disponible, publish() devuelve false y se registra un aviso, pero ninguna operación de negocio
 * falla por eso: el estado de la flota se vuelve a publicar completo cada 30 s (snapshot), que repara lo perdido.
 */
@Injectable()
export class MessageBus implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MessageBus.name);
  private readonly url?: string;
  readonly exchange: string;
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.ConfirmChannel | null = null;
  private stopped = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  /** Solo sin broker: lo publicado, para tests y diagnóstico. */
  readonly published: PublishedEvent[] = [];

  constructor(config: ConfigService) {
    this.url = config.get<string>('AMQP_URL');
    this.exchange = config.get<string>('AMQP_EXCHANGE') ?? 'rutalibre.eventos';
  }

  get mode(): 'rabbitmq' | 'memoria' {
    return this.url ? 'rabbitmq' : 'memoria';
  }

  get connected(): boolean {
    return this.mode === 'memoria' || this.channel !== null;
  }

  async onModuleInit(): Promise<void> {
    if (!this.url) {
      this.logger.warn('AMQP_URL no definida: los eventos de flota quedan en memoria (ningún servicio los recibe)');
      return;
    }
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    await this.connection?.close().catch(() => undefined);
  }

  /** Arma el sobre CloudEvents y lo publica. Nunca lanza: devuelve si el broker confirmó el mensaje. */
  async publish<T>(routingKey: string, type: string, data: T, correlationId: string): Promise<boolean> {
    const event: BusEvent<T> = {
      specversion: '1.0', id: randomUUID(), type, source: 'ms-reservas', time: new Date().toISOString(),
      correlationid: correlationId, datacontenttype: 'application/json', data,
    };
    if (this.mode === 'memoria') {
      this.published.push({ routingKey, event });
      if (this.published.length > MEMORY_LIMIT) this.published.shift();
      return true;
    }
    const channel = this.channel;
    if (!channel) {
      this.logger.warn(`RabbitMQ no disponible: ${routingKey} no se publicó (lo cubre el próximo snapshot) cid=${correlationId}`);
      return false;
    }
    try {
      channel.publish(this.exchange, routingKey, Buffer.from(JSON.stringify(event)), {
        persistent: true, contentType: 'application/json', messageId: event.id, correlationId, type, timestamp: Math.floor(Date.now() / 1000),
      });
      await channel.waitForConfirms();
      return true;
    } catch (error) {
      this.logger.warn(`No se pudo publicar ${routingKey}: ${(error as Error).message} cid=${correlationId}`);
      return false;
    }
  }

  private async connect(): Promise<void> {
    try {
      const connection = await amqp.connect(this.url!, { clientProperties: { connection_name: 'ms-reservas' } });
      connection.on('error', (error) => this.logger.warn(`RabbitMQ: ${error.message}`));
      connection.on('close', () => this.scheduleReconnect('conexión cerrada'));
      const channel = await connection.createConfirmChannel();
      await channel.assertExchange(this.exchange, 'topic', { durable: true });
      this.connection = connection;
      this.channel = channel;
      this.logger.log(`Publicando eventos en RabbitMQ (exchange ${this.exchange})`);
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
}
