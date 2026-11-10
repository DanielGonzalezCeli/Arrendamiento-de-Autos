import { join } from 'path';
import { DataSourceOptions } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

/**
 * Base de datos por servicio: ms-clientes comparte la instancia de PostgreSQL, pero sus tablas (y su historial
 * de migraciones) viven en el schema "clientes" y ningún otro servicio las lee.
 */
export const CLIENTS_SCHEMA = 'clientes';

export function buildTypeOrmOptions(databaseUrl: string): DataSourceOptions {
  return {
    type: 'postgres',
    url: databaseUrl,
    schema: CLIENTS_SCHEMA,
    synchronize: false,
    namingStrategy: new SnakeNamingStrategy(),
    entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
    migrations: [join(__dirname, '..', 'database', 'migrations', '*.{ts,js}')],
    // Pool pequeño: los servicios comparten el límite de conexiones del plan de Supabase.
    extra: { max: 3 },
  };
}
