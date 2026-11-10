import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { buildTypeOrmOptions, CLIENTS_SCHEMA } from '../config/typeorm.config';

/**
 * Se ejecuta antes de arrancar el servicio (comando de inicio en Azure y en CI): crea el schema "clientes"
 * (TypeORM guarda ahí su historial de migraciones) y aplica las migraciones.
 */
async function main() {
  if (!process.env.DATABASE_URL) {
    try {
      process.loadEnvFile?.('.env');
    } catch {
      // sin archivo .env: se usan las variables del entorno
    }
  }
  const dataSource = await new DataSource(buildTypeOrmOptions(process.env.DATABASE_URL ?? '')).initialize();
  try {
    await dataSource.query(`CREATE SCHEMA IF NOT EXISTS ${CLIENTS_SCHEMA}`);
    const applied = await dataSource.runMigrations({ transaction: 'each' });
    console.log(`[ms-clientes] Migraciones aplicadas: ${applied.map((m) => m.name).join(', ') || 'ninguna pendiente'}.`);
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
