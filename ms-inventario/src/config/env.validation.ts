import { plainToInstance } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, IsUrl, Max, Min, validateSync } from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

/** Variables de ms-inventario. Si falta una obligatoria o tiene un formato inválido, el servicio no arranca. */
export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3004;

  @IsString()
  DATABASE_URL!: string;

  /** RabbitMQ (CloudAMQP en producción). Sin él no se consumen eventos: el servicio queda a la espera. */
  @IsOptional()
  @IsString()
  AMQP_URL?: string;

  /** Exchange (topic) donde ms-reservas publica los eventos de flota. */
  @IsString()
  AMQP_EXCHANGE: string = 'rutalibre.eventos';

  /** Cola durable de este servicio, enlazada a flota.* (y su cola de mensajes muertos, <cola>.dlq). */
  @IsString()
  AMQP_QUEUE: string = 'ms-inventario.flota';

  /** Envío de stock a Booking: gRPC (Tailscale/local), HTTP (respaldo en la nube) u off. */
  @IsIn(['off', 'grpc', 'http'])
  STOCK_SYNC_MODE: 'off' | 'grpc' | 'http' = 'off';

  @IsString()
  BOOKING_GRPC_TARGET: string = 'localhost:50051';

  @IsUrl({ require_tld: false, require_protocol: true })
  BOOKING_STOCK_HTTP_URL: string = 'https://booking-core-api.azurewebsites.net/api/v3/inventory/stock';

  /** X-API-Key para el envío HTTP a Booking. */
  @IsOptional()
  @IsString()
  BOOKING_API_KEY?: string;

  /** service_id del inventory.proto (nodo de la tienda en Booking). */
  @IsString()
  NODE_ID: string = 'NODE_AUT_RUTALIBRE';

  /** Ruta a inventory.proto. Por defecto: ../contracts/inventory.proto respecto al servicio. */
  @IsOptional()
  @IsString()
  INVENTORY_PROTO_PATH?: string;

  /** ms-identidad: su JWKS verifica el token del administrador en la API interna (panel /admin/booking). */
  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true })
  IDENTITY_URL?: string;

  /** Clave pública RSA (PEM) de ms-identidad en lugar del JWKS. Solo para tests. */
  @IsOptional()
  @IsString()
  IDENTITY_JWT_PUBLIC_KEY?: string;

  @IsInt()
  @Min(0)
  @Max(5)
  TRUST_PROXY_HOPS: number = 0;

  @IsString()
  LOG_LEVEL: string = 'info';
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  // "VAR=" (vacía, como en .env.example) equivale a no definida: se aplica el valor por defecto.
  const defined = Object.fromEntries(Object.entries(config).filter(([, value]) => value !== ''));
  const validated = plainToInstance(EnvironmentVariables, defined, { enableImplicitConversion: true });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const detail = errors.map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`);
    throw new Error(`Configuración inválida:\n- ${detail.join('\n- ')}`);
  }
  return validated;
}
