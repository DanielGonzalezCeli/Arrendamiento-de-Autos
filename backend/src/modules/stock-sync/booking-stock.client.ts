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

/** Respaldo acordado: POST {BOOKING_STOCK_HTTP_URL} con el JSON del mensaje protobuf. */
export class HttpStockTransport implements BookingStockTransport {
  readonly name = 'http' as const;

  constructor(private readonly url: string) {}

  async push(message: StockUpdateMessage): Promise<StockUpdateAck> {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await response.json().catch(() => ({}))) as Partial<StockUpdateAck>;
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.message ?? response.statusText}`);
    return { success: body.success ?? true, ...body };
  }

  close(): void {}
}
