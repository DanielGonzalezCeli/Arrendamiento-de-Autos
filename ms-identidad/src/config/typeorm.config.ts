import { join } from 'path';
import { DataSourceOptions } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

/**
 * Base de datos por servicio: ms-identidad comparte la instancia de PostgreSQL con ms-reservas, pero sus
 * tablas (y su historial de migraciones) viven en el schema "identidad" y ningún otro servicio las lee.
 */
export const IDENTITY_SCHEMA = 'identidad';

export function buildTypeOrmOptions(databaseUrl: string): DataSourceOptions {
  return {
    type: 'postgres',
    url: databaseUrl,
    schema: IDENTITY_SCHEMA,
    synchronize: false,
    namingStrategy: new SnakeNamingStrategy(),
    entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
    migrations: [join(__dirname, '..', 'database', 'migrations', '*.{ts,js}')],
    // Pool pequeño: ms-identidad y ms-reservas comparten el límite de conexiones del plan de Supabase.
    extra: { max: 3 },
  };
}
