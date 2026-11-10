import 'reflect-metadata';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { canonicalEmail } from '../common/contact-rules';
import { buildTypeOrmOptions, IDENTITY_SCHEMA } from '../config/typeorm.config';
import { BCRYPT_COST } from '../users/password';
import { User, UserRole } from '../users/user.entity';

const DEMO_USERS = [
  { email: 'admin@rutalibre.ec', firstName: 'Admin', lastName: 'RutaLibre', phone: null, role: UserRole.Admin, passwordEnv: 'SEED_ADMIN_PASSWORD', devPassword: 'Admin12345!' },
  { email: 'cliente@rutalibre.ec', firstName: 'Camila', lastName: 'Torres', phone: '+593991234567', role: UserRole.Customer, passwordEnv: 'SEED_CUSTOMER_PASSWORD', devPassword: 'Cliente12345!' },
];

/**
 * Se ejecuta antes de arrancar el servicio (comando de inicio en Azure y en CI):
 * 1. Crea el schema "identidad" (TypeORM guarda ahí su historial de migraciones) y aplica las migraciones.
 * 2. Crea los usuarios de demostración que falten. Nunca modifica cuentas existentes; en producción solo con
 *    la contraseña definida en SEED_*_PASSWORD.
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
    await dataSource.query(`CREATE SCHEMA IF NOT EXISTS ${IDENTITY_SCHEMA}`);
    const applied = await dataSource.runMigrations({ transaction: 'each' });
    console.log(`[ms-identidad] Migraciones aplicadas: ${applied.map((m) => m.name).join(', ') || 'ninguna pendiente'}.`);

    const isProduction = process.env.NODE_ENV === 'production';
    const repo = dataSource.getRepository(User);
    for (const { passwordEnv, devPassword, ...user } of DEMO_USERS) {
      if (await repo.existsBy({ emailCanonical: canonicalEmail(user.email) })) continue;
      const password = process.env[passwordEnv] || (isProduction ? undefined : devPassword);
      if (!password) {
        console.warn(`[ms-identidad] ${passwordEnv} no definida: no se crea ${user.email}.`);
        continue;
      }
      await repo.save(repo.create({ ...user, emailCanonical: canonicalEmail(user.email), passwordHash: await bcrypt.hash(password, BCRYPT_COST) }));
      console.log(`[ms-identidad] Usuario ${user.email} creado.`);
    }
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
