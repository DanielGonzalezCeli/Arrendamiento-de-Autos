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
import { User } from '../../modules/users/user.entity';
import {
  AFFILIATES, CATEGORIES, CITIES, COLORS, CURRENCY_RATES, DAILY_RATES, DEPOTS, EXTRAS, RATE_VALIDITY, SUPPLIERS, VEHICLE_MODELS,
} from './seed-data';

const BCRYPT_COST = 12;
const DEV_ADMIN_PASSWORD = 'Admin12345!';
const DEV_CUSTOMER_PASSWORD = 'Cliente12345!';

/**
 * Seed idempotente: si ya hay proveedores, no hace nada. Se ejecuta en cada arranque del
 * contenedor (Dockerfile), así una BD nueva queda lista para la demo sin pasos manuales.
 */
async function main() {
  loadLocalEnv();
  const isProduction = process.env.NODE_ENV === 'production';
  const dataSource = await new DataSource(buildTypeOrmOptions(process.env.DATABASE_URL ?? '')).initialize();

  try {
    if ((await dataSource.getRepository(Supplier).count()) > 0) {
      console.log('[seed] La BD ya tiene datos; no se modifica.');
      return;
    }
    await dataSource.transaction(async (manager) => {
      await seedCatalog(manager);
      await seedUsers(manager, isProduction);
    });
    console.log('[seed] Datos de demostración creados.');
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

async function seedUsers(manager: EntityManager, isProduction: boolean) {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || (isProduction ? undefined : DEV_ADMIN_PASSWORD);
  const customerPassword = process.env.SEED_CUSTOMER_PASSWORD || (isProduction ? undefined : DEV_CUSTOMER_PASSWORD);

  if (adminPassword) {
    await manager.save(User, {
      email: 'admin@rutalibre.ec', firstName: 'Admin', lastName: 'RutaLibre', role: UserRole.Admin,
      passwordHash: await bcrypt.hash(adminPassword, BCRYPT_COST),
    });
  } else {
    console.warn('[seed] SEED_ADMIN_PASSWORD no definida: no se crea el usuario administrador.');
  }
  if (customerPassword) {
    await manager.save(User, {
      email: 'cliente@rutalibre.ec', firstName: 'Camila', lastName: 'Torres', phone: '0991234567', role: UserRole.Customer,
      passwordHash: await bcrypt.hash(customerPassword, BCRYPT_COST),
    });
  }
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
