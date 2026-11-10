import { plainToInstance } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUrl, Max, Min, validateSync } from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

/** Variables de ms-clientes. Si falta una obligatoria o tiene un formato inválido, el servicio no arranca. */
export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3003;

  @IsString()
  DATABASE_URL!: string;

  /** X-API-Key de Booking (la misma que valida ms-reservas). Sin ella, en producción se rechaza todo. */
  @IsOptional()
  @IsString()
  BOOKING_API_KEY?: string;

  /** ms-identidad: su JWKS verifica los tokens de los administradores (búsquedas del panel). */
  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true })
  IDENTITY_URL?: string;

  /** Clave pública RSA (PEM) de ms-identidad en lugar del JWKS. Solo para tests. */
  @IsOptional()
  @IsString()
  IDENTITY_JWT_PUBLIC_KEY?: string;

  /** Proxies de confianza (gateway, front-end de Azure), para registrar la IP real del cliente. */
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
