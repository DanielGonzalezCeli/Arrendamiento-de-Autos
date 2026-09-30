import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { resolve } from 'path';
import jestOpenAPI from 'jest-openapi';

import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';

/** Ruta del contrato oficial: los tests validan las respuestas reales contra este archivo. */
export const CONTRACT_PATH = resolve(__dirname, '..', '..', '..', 'contracts', 'autos-openapi.yaml');

/** Registra el matcher `toSatisfyApiSpec()` con el contrato oficial. */
export function useContract(): void {
  jestOpenAPI(CONTRACT_PATH);
}

export async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

/** Fecha futura (dentro de `days` días a las 10:00 de Ecuador) en formato RFC 3339. */
export function futureDate(days: number, hour = 10): string {
  const date = new Date(Date.now() + days * 24 * 3600_000);
  const ymd = date.toISOString().slice(0, 10);
  return `${ymd}T${String(hour).padStart(2, '0')}:00:00-05:00`;
}

export function searchBody(overrides: Record<string, unknown> = {}) {
  return {
    booker: { country: 'ec' },
    currency: 'USD',
    driver: { age: 30 },
    route: {
      pickup: { datetime: futureDate(10), location: { airport: 'UIO' } },
      dropoff: { datetime: futureDate(13), location: { airport: 'UIO' } },
    },
    ...overrides,
  };
}
