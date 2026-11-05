import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { resolve } from 'path';
import { StockUpdateAck, StockUpdateMessage } from './stock-message';

/** Transporte hacia Booking: gRPC (Tailscale/local) o el respaldo REST en la nube con el mismo JSON. */
export interface BookingStockTransport {
  readonly name: 'grpc' | 'http';
  push(message: StockUpdateMessage): Promise<StockUpdateAck>;
  close(): void;
}

const TIMEOUT_MS = 5_000;

export function resolveProtoPath(configuredPath?: string): string {
  return configuredPath ? resolve(configuredPath) : resolve(process.cwd(), '..', 'contracts', 'inventory.proto');
}

type PushFn = (
  message: StockUpdateMessage, options: { deadline: Date }, callback: (error: grpc.ServiceError | null, ack: StockUpdateAck) => void,
) => void;

/** Cliente de inventory.InventoryStockService/PushStockUpdate sin TLS (h2c), como indica la guía. */
export class GrpcStockTransport implements BookingStockTransport {
  readonly name = 'grpc' as const;
  private readonly client: grpc.Client & { PushStockUpdate: PushFn };

  constructor(target: string, protoPath: string) {
    const definition = protoLoader.loadSync(protoPath, { keepCase: true, longs: Number, enums: String, defaults: true, oneofs: true });
    const proto = grpc.loadPackageDefinition(definition) as unknown as {
      inventory: { InventoryStockService: new (target: string, credentials: grpc.ChannelCredentials) => grpc.Client & { PushStockUpdate: PushFn } };
    };
    this.client = new proto.inventory.InventoryStockService(target, grpc.credentials.createInsecure());
  }

  push(message: StockUpdateMessage): Promise<StockUpdateAck> {
    return new Promise((resolvePromise, reject) => {
      this.client.PushStockUpdate(message, { deadline: new Date(Date.now() + TIMEOUT_MS) }, (error, ack) =>
        error ? reject(new Error(`gRPC ${grpc.status[error.code] ?? error.code}: ${error.details || error.message}`)) : resolvePromise(ack));
    });
  }

  close(): void {
    this.client.close();
  }
}

/** Lo útil de un error de Booking (Problem Details): code, detail y los campos inválidos, sin el resto del sobre. */
function problemSummary(body: Record<string, unknown>, raw: string): string {
  const fields = body.invalid_params ?? body.errors ?? body.violations ?? body.message;
  const parts = [body.code, body.detail, fields === undefined ? undefined : JSON.stringify(fields)].filter((p) => p !== undefined && p !== null);
  return parts.length ? parts.map(String).join(' · ').slice(0, 280) : raw.slice(0, 280);
}

/**
 * Push REST de Booking en Azure: POST {BOOKING_STOCK_HTTP_URL} con X-API-Key y exactamente el cuerpo que su
 * validador acepta — { service_id, item_id, available_units, date, time_slot: "DEFAULT" }. Cualquier campo
 * extra (timestamp, slot_id, reason) o una franja "HH:mm" responde 400 CONTRACT_VALIDATION_ERROR.
 */
export function toBookingStockBody(message: StockUpdateMessage) {
  return {
    service_id: message.service_id,
    item_id: message.item_id,
    available_units: message.available_units,
    date: message.date,
    time_slot: 'DEFAULT',
  };
}

export class HttpStockTransport implements BookingStockTransport {
  readonly name = 'http' as const;

  constructor(private readonly url: string, private readonly apiKey?: string) {}

  async push(message: StockUpdateMessage): Promise<StockUpdateAck> {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(this.apiKey ? { 'X-API-Key': this.apiKey } : {}) },
      body: JSON.stringify(toBookingStockBody(message)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const raw = await response.text().catch(() => '');
    let body: Partial<StockUpdateAck> = {};
    try {
      body = JSON.parse(raw) as Partial<StockUpdateAck>;
    } catch {
      // cuerpo vacío o no JSON: se reporta el texto tal cual
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${problemSummary(body as Record<string, unknown>, raw) || response.statusText}`);
    return { success: body.success ?? true, ...body };
  }

  close(): void {}
}
