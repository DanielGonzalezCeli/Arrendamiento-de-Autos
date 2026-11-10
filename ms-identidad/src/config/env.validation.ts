import { plainToInstance } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUrl, Max, Min, validateSync } from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

/** Variables de ms-identidad. Si falta una obligatoria o tiene un formato inválido, el servicio no arranca. */
export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3002;

  @IsString()
  DATABASE_URL!: string;

  /** Clave privada RSA (PEM) que firma los JWT de usuario. Obligatoria en producción (ver TokenService). */
  @IsOptional()
  @IsString()
  IDENTITY_JWT_PRIVATE_KEY?: string;

  @IsString()
  USER_JWT_EXPIRES_IN: string = '2h';

  @IsString()
  CORS_ORIGINS: string = 'http://localhost:5173';

  /** ms-reservas: historial de los usuarios (cuántas reservas tienen, si se pueden eliminar). */
  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true })
  MS_RESERVAS_URL?: string;

  /** Proxies de confianza (gateway, front-end de Azure): el límite de intentos de login usa la IP real del cliente. */
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
