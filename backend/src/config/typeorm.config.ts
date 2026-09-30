import { join } from 'path';
import { DataSourceOptions } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

/**
 * Configuración única de TypeORM, compartida por la app (Nest) y por la CLI de migraciones.
 * synchronize=false siempre: el esquema solo cambia mediante migraciones versionadas.
 * SnakeNamingStrategy: propiedades camelCase en TypeScript ↔ columnas snake_case en PostgreSQL.
 */
export function buildTypeOrmOptions(databaseUrl: string): DataSourceOptions {
  return {
    type: 'postgres',
    url: databaseUrl,
    synchronize: false,
    namingStrategy: new SnakeNamingStrategy(),
    entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
    migrations: [join(__dirname, '..', 'database', 'migrations', '*.{ts,js}')],
    // Pool pequeño: los planes gratuitos de Postgres limitan las conexiones.
    extra: { max: 5 },
  };
}
