import { join } from 'path';
import { DataSourceOptions } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

/**
 * Base de datos por servicio: ms-inventario comparte la instancia de PostgreSQL, pero sus tablas (y su historial de
 * migraciones) viven en el schema "inventario" y ningún otro servicio las lee.
 */
export const INVENTORY_SCHEMA = 'inventario';

export function buildTypeOrmOptions(databaseUrl: string): DataSourceOptions {
  return {
    type: 'postgres',
    url: databaseUrl,
    schema: INVENTORY_SCHEMA,
    synchronize: false,
    namingStrategy: new SnakeNamingStrategy(),
    entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
    migrations: [join(__dirname, '..', 'database', 'migrations', '*.{ts,js}')],
    // Pool pequeño: los servicios comparten el límite de conexiones del plan de Supabase.
    extra: { max: 3 },
  };
}
