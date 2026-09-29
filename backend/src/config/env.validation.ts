import { plainToInstance } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUrl, Max, Min, validateSync } from 'class-validator';

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
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, { enableImplicitConversion: true });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const detail = errors.map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`);
    throw new Error(`Configuración inválida:\n- ${detail.join('\n- ')}`);
  }
  return validated;
}
