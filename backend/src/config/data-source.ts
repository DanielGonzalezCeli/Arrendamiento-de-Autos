import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { buildTypeOrmOptions } from './typeorm.config';

/** DataSource usado solo por la CLI de TypeORM (migraciones). */
if (!process.env.DATABASE_URL) {
  try {
    // En desarrollo carga backend/.env; en producción las variables vienen de la plataforma.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    process.loadEnvFile?.('.env');
  } catch {
    // sin archivo .env: se usan las variables del entorno
  }
}

export default new DataSource(buildTypeOrmOptions(process.env.DATABASE_URL ?? ''));
