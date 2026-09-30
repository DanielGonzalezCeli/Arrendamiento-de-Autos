import 'reflect-metadata';
import * as bcrypt from 'bcryptjs';
import { DataSource, EntityManager } from 'typeorm';

import { buildTypeOrmOptions } from '../../config/typeorm.config';
import { UserRole } from '../../domain/enums';
import { City } from '../../modules/catalog/entities/city.entity';
import { CurrencyRate } from '../../modules/catalog/entities/currency-rate.entity';
import { DepotOpeningHours } from '../../modules/catalog/entities/depot-opening-hours.entity';
import { Depot } from '../../modules/catalog/entities/depot.entity';
import { Extra } from '../../modules/catalog/entities/extra.entity';
import { FleetUnit } from '../../modules/catalog/entities/fleet-unit.entity';
import { Rate } from '../../modules/catalog/entities/rate.entity';
import { Supplier } from '../../modules/catalog/entities/supplier.entity';
import { VehicleCategory } from '../../modules/catalog/entities/vehicle-category.entity';
import { VehicleModel } from '../../modules/catalog/entities/vehicle-model.entity';
import { Affiliate } from '../../modules/integration-auth/entities/affiliate.entity';
import { ApiClient } from '../../modules/integration-auth/entities/api-client.entity';
import { DepotReview } from '../../modules/reviews/depot-review.entity';
import { User } from '../../modules/users/user.entity';
import {
  AFFILIATES, CATEGORIES, CITIES, COLORS, CURRENCY_RATES, DAILY_RATES, DEMO_API_CLIENT, DEPOTS, EXTRAS, RATE_VALIDITY, SAMPLE_REVIEWS,
  SUPPLIERS, VEHICLE_MODELS,
} from './seed-data';

const BCRYPT_COST = 12;
const DEV_ADMIN_PASSWORD = 'Admin12345!';
const DEV_CUSTOMER_PASSWORD = 'Cliente12345!';
const DEV_HUB_CLIENT_SECRET = 'hub-demo-secret-2026';

/**
 * Seed idempotente, ejecutado en cada arranque del contenedor (Dockerfile):
 * - Catálogo: solo si la BD no tiene proveedores.
 * - Usuarios de demo: cada uno se crea si falta y su contraseña está configurada. Es independiente
 *   del catálogo, para que un arranque sin SEED_ADMIN_PASSWORD no impida crear el admin después.
 * Nunca modifica datos existentes (no cambia contraseñas ya creadas).
 */
async function main() {
  loadLocalEnv();
  const isProduction = process.env.NODE_ENV === 'production';
  const dataSource = await new DataSource(buildTypeOrmOptions(process.env.DATABASE_URL ?? '')).initialize();

  try {
    await dataSource.transaction(async (manager) => {
      if ((await manager.count(Supplier)) === 0) {
        await seedCatalog(manager);
        console.log('[seed] Catálogo de demostración creado.');
      } else {
        console.log('[seed] El catálogo ya existe; no se modifica.');
      }
      await seedUsers(manager, isProduction);
      await seedApiClient(manager, isProduction);
      await seedReviews(manager);
    });
  } finally {
    await dataSource.destroy();
  }
}

async function seedCatalog(manager: EntityManager) {
  await manager.save(City, CITIES);
  await manager.save(Supplier, SUPPLIERS);

  for (const { hours, ...depot } of DEPOTS) {
    await manager.save(Depot, depot);
    await manager.save(DepotOpeningHours, hours.map((h) => ({ ...h, depotId: depot.id })));
  }
  // Las identidades se insertaron con id explícito: se alinean las secuencias para futuros INSERT.
  for (const table of ['cities', 'suppliers', 'depots']) {
    await manager.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), (SELECT max(id) FROM ${table}))`);
  }

  const categories = await manager.save(VehicleCategory, CATEGORIES);
  const categoryId = (code: string) => categories.find((c) => c.code === code)!.id;

  let plateNumber = 1000;
  for (const seed of VEHICLE_MODELS) {
    const model = await manager.save(VehicleModel, {
      supplierId: seed.supplierId,
      categoryId: categoryId(seed.category),
      make: seed.make,
      model: seed.model,
      acrissCode: seed.acriss,
      transmission: seed.transmission,
      fuelType: seed.fuelType,
      seats: seed.seats,
      doors: seed.doors,
      bagCapacity: seed.bags,
      published: true,
      imageUrl: `/cars/${seed.image}.jpg`,
      description: `${seed.make} ${seed.model} o similar.`,
    });
    for (const [depotId, quantity] of Object.entries(seed.units)) {
      for (let i = 0; i < quantity; i++) {
        plateNumber++;
        await manager.save(FleetUnit, {
          vehicleModelId: model.id,
          depotId: Number(depotId),
          plate: `P${seed.supplierId === 1 ? 'AN' : 'PC'}-${plateNumber}`,
          year: 2024 + (plateNumber % 2),
          color: COLORS[plateNumber % COLORS.length],
          mileage: 5000 + (plateNumber % 7) * 3100,
        });
      }
    }
  }

  for (const [supplierId, rates] of Object.entries(DAILY_RATES)) {
    for (const [category, dailyRate] of Object.entries(rates)) {
      await manager.save(Rate, { supplierId: Number(supplierId), categoryId: categoryId(category), dailyRate, ...RATE_VALIDITY });
    }
  }

  await manager.save(Extra, EXTRAS);
  await manager.save(CurrencyRate, CURRENCY_RATES);
  await manager.save(Affiliate, AFFILIATES);
}

const DEMO_USERS = [
  {
    email: 'admin@rutalibre.ec', firstName: 'Admin', lastName: 'RutaLibre', phone: null, role: UserRole.Admin,
    passwordEnv: 'SEED_ADMIN_PASSWORD', devPassword: DEV_ADMIN_PASSWORD,
  },
  {
    email: 'cliente@rutalibre.ec', firstName: 'Camila', lastName: 'Torres', phone: '+593991234567', role: UserRole.Customer,
    passwordEnv: 'SEED_CUSTOMER_PASSWORD', devPassword: DEV_CUSTOMER_PASSWORD,
  },
];

async function seedUsers(manager: EntityManager, isProduction: boolean) {
  for (const { passwordEnv, devPassword, ...user } of DEMO_USERS) {
    if (await manager.exists(User, { where: { email: user.email } })) continue;

    // En producción la contraseña es obligatoria (nunca se usa la de desarrollo).
    const password = process.env[passwordEnv] || (isProduction ? undefined : devPassword);
    if (!password) {
      console.warn(`[seed] ${passwordEnv} no definida: no se crea ${user.email}.`);
      continue;
    }
    await manager.save(User, { ...user, passwordHash: await bcrypt.hash(password, BCRYPT_COST) });
    console.log(`[seed] Usuario ${user.email} creado.`);
  }
}

/** Cliente OAuth2 del Hub para el emisor local (RDA1). El secreto se guarda con hash. */
async function seedApiClient(manager: EntityManager, isProduction: boolean) {
  if (await manager.exists(ApiClient, { where: { clientId: DEMO_API_CLIENT.clientId } })) return;
  const secret = process.env.SEED_HUB_CLIENT_SECRET || (isProduction ? undefined : DEV_HUB_CLIENT_SECRET);
  if (!secret) {
    console.warn(`[seed] SEED_HUB_CLIENT_SECRET no definida: no se crea el cliente ${DEMO_API_CLIENT.clientId}.`);
    return;
  }
  await manager.save(ApiClient, { ...DEMO_API_CLIENT, clientSecretHash: await bcrypt.hash(secret, BCRYPT_COST) });
  console.log(`[seed] Cliente OAuth2 ${DEMO_API_CLIENT.clientId} creado.`);
}

async function seedReviews(manager: EntityManager) {
  if ((await manager.count(DepotReview)) > 0) return;
  const reviews = SAMPLE_REVIEWS.flatMap(({ depotId, scores }) => scores.map((score) => ({ depotId, score })));
  await manager.save(DepotReview, reviews);
  console.log(`[seed] ${reviews.length} reseñas de ejemplo creadas.`);
}

function loadLocalEnv() {
  if (process.env.DATABASE_URL) return;
  try {
    process.loadEnvFile('.env');
  } catch {
    // sin .env: se usan las variables del entorno
  }
}

main().catch((error) => {
  console.error('[seed] Error:', error);
  process.exit(1);
});
