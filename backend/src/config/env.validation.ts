import { plainToInstance, Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUrl, Matches, Max, Min, MinLength, validateSync } from 'class-validator';

/**
 * "true"/"false" de las variables de entorno → boolean. Se lee el valor ORIGINAL (obj[key]):
 * la conversión implícita ya habría convertido "false" en Boolean("false") === true.
 */
const toBoolean = ({ obj, key }: { obj: Record<string, unknown>; key: string }) => obj[key] === true || obj[key] === 'true';

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

/**
 * Variables de entorno admitidas. Si falta una obligatoria o tiene un formato
 * inválido, la aplicación no arranca (falla rápido en vez de fallar en runtime).
 */
export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsString()
  DATABASE_URL: string;

  /** Secreto HS256 de los JWT de usuarios web (≥ 32 caracteres). Distinto de las claves de integración. */
  @IsString()
  @MinLength(32)
  USER_JWT_SECRET: string;

  @IsOptional()
  @IsString()
  USER_JWT_EXPIRES_IN?: string;

  /** Orígenes permitidos para la API interna, separados por coma. */
  @IsString()
  CORS_ORIGINS: string = 'http://localhost:5173';

  /** URL pública de esta instancia; se usa en Swagger ("Try it out") y en los enlaces HATEOAS. */
  @IsOptional()
  @IsUrl({ require_tld: false })
  PUBLIC_BASE_URL?: string;

  /** Ruta al contrato oficial. Por defecto: ../contracts/autos-openapi.yaml respecto al backend. */
  @IsOptional()
  @IsString()
  CONTRACT_PATH?: string;

  @IsOptional()
  @IsString()
  LOG_LEVEL?: string;

  // ── API de integración (Booking Hub) ──────────────────────────────────────
  /** Emisor esperado en los tokens OAuth2 (y el que usa el emisor local de RDA1). */
  @IsString()
  INTEGRATION_JWT_ISSUER: string = 'rutalibre-local-idp';

  @IsString()
  INTEGRATION_JWT_AUDIENCE: string = 'autos-api';

  /** RDA2: JWKS del IdP central. Si se define, los tokens se verifican contra él. */
  @IsOptional()
  @IsUrl({ require_tld: false })
  INTEGRATION_JWKS_URL?: string;

  /** RDA1: habilita POST /oauth2/token y /.well-known/jwks.json (emisor self-signed). */
  @Transform(toBoolean)
  @IsBoolean()
  LOCAL_OAUTH_ISSUER_ENABLED: boolean = true;

  /** Clave privada RSA en PEM (PKCS#8). Sin ella se usa una clave efímera. */
  @IsOptional()
  @IsString()
  LOCAL_OAUTH_PRIVATE_KEY?: string;

  @IsInt()
  @Min(60)
  INTEGRATION_TOKEN_TTL_SECONDS: number = 3600;

  /** lenient (RDA1): cualquier X-Affiliate-Id entero · strict: debe existir en affiliates. */
  @IsIn(['lenient', 'strict'])
  AFFILIATE_VALIDATION: 'lenient' | 'strict' = 'lenient';

  // ── Eventos / webhooks ────────────────────────────────────────────────────
  /** Cada cuánto corre el dispatcher de webhooks (ms). 0 = desactivado (tests). */
  @IsInt()
  @Min(0)
  WEBHOOK_DISPATCH_INTERVAL_MS: number = 10_000;

  /** Cada cuánto corre la limpieza (holds vencidos, idempotencia caducada). 0 = desactivado. */
  @IsInt()
  @Min(0)
  MAINTENANCE_INTERVAL_MS: number = 600_000;

  /** Clave AES-256 (32 bytes en base64) para los secrets de webhooks. Sin ella se deriva con HKDF de USER_JWT_SECRET. */
  @IsOptional()
  @IsString()
  DATA_ENCRYPTION_KEY?: string;

  // ── Reto 2: integración con Booking Prototipo (contrato v3 + inventory.proto) ──
  /** Clave que Booking envía en X-API-Key (TIENDA_AUTOS_API_KEY de su lado). Sin ella, esas rutas quedan abiertas. */
  @IsOptional()
  @IsString()
  @MinLength(16)
  BOOKING_API_KEY?: string;

  /** ID del nodo registrado en el dashboard de Booking (service_id del gRPC). */
  @Matches(/^NODE_AUT_[A-Z0-9_]+$/)
  NODE_ID: string = 'NODE_AUT_RUTALIBRE';

  @IsString()
  PARTNER_NAME: string = 'RutaLibre Renta de Autos';

  /** URL pública del frontend (para las fotos /cars/… del catálogo v3). Por defecto, el primer origen de CORS_ORIGINS. */
  @IsOptional()
  @IsUrl({ require_tld: false })
  PUBLIC_WEB_URL?: string;

  /** Envío de stock a Booking: off · grpc (Tailscale/local, puerto 50051) · http (respaldo en la nube). */
  @IsIn(['off', 'grpc', 'http'])
  STOCK_SYNC_MODE: 'off' | 'grpc' | 'http' = 'off';

  /** host:puerto del servidor gRPC de Booking (IP de Tailscale en la prueba conjunta). */
  @IsString()
  BOOKING_GRPC_TARGET: string = 'localhost:50051';

  @IsUrl({ require_tld: false })
  BOOKING_STOCK_HTTP_URL: string = 'https://rda1-backend-integracion-sistemas.onrender.com/api/v3/inventory/stock';

  /** Cada cuánto se reconcilia el stock con Booking (ms). 0 = solo al reservar/cancelar. */
  @IsInt()
  @Min(0)
  STOCK_SYNC_INTERVAL_MS: number = 30_000;

  /** Ruta a inventory.proto. Por defecto: ../contracts/inventory.proto respecto al backend. */
  @IsOptional()
  @IsString()
  INVENTORY_PROTO_PATH?: string;

  /** Log en archivo de la API v3 (JSON por línea, con correlation_id e idempotency_key). "off" = desactivado. */
  @IsString()
  INTEGRATION_LOG_FILE: string = 'logs/integration-v3.log';

  /** Valor del header X-API-Deprecation-Date (YYYY-MM-DD). Opcional. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  API_DEPRECATION_DATE?: string;
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
