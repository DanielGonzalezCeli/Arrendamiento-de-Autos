import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { MaintenanceService } from '../../src/modules/events/maintenance.service';
import { createApp } from '../contract/contract-app';

/** Tareas periódicas: holds vencidos → EXPIRED; claves de idempotencia caducadas → borradas. */
describe('MaintenanceService', () => {
  let app: INestApplication;
  let db: DataSource;
  const owner = `test-maintenance-${Date.now()}`;

  beforeAll(async () => {
    app = await createApp();
    db = app.get(DataSource);
  });

  afterAll(async () => {
    await db.query(`DELETE FROM holds WHERE owner_sub = $1`, [owner]);
    await db.query(`DELETE FROM idempotency_records WHERE owner_sub = $1`, [owner]);
    await app?.close();
  });

  it('marca EXPIRED los holds vencidos y borra idempotencia caducada, sin tocar lo vigente', async () => {
    const [session] = await db.query(
      `INSERT INTO search_sessions (channel, pickup_at, dropoff_at, pickup_depot_ids, dropoff_depot_ids, driver_age, booker_country, currency, request, expires_at)
       VALUES ('WEB', now() + interval '10 days', now() + interval '12 days', ARRAY[1], ARRAY[1], 30, 'ec', 'USD', '{}', now()) RETURNING id`,
    );
    const [model] = await db.query(`SELECT id FROM vehicle_models LIMIT 1`);
    const insertHold = async (expiresInMinutes: number) => (await db.query(
      `INSERT INTO holds (search_session_id, vehicle_model_id, pickup_depot_id, dropoff_depot_id, owner_sub, pickup_at, dropoff_at, quoted_total, currency, expires_at)
       VALUES ($1, $2, 1, 1, $3, now() + interval '10 days', now() + interval '12 days', 100, 'USD', now() + make_interval(mins => $4)) RETURNING id`,
      [session.id, model.id, owner, expiresInMinutes],
    ))[0].id;
    const expired = await insertHold(-5);
    const active = await insertHold(10);
    const insertKey = (expiresInHours: number) => db.query(
      `INSERT INTO idempotency_records (owner_sub, idempotency_key, operation, request_hash, status, expires_at)
       VALUES ($1, $2, 'test', repeat('0', 64), 'COMPLETED', now() + make_interval(hours => $3))`,
      [owner, randomUUID(), expiresInHours],
    );
    await insertKey(-1);
    await insertKey(5);

    await app.get(MaintenanceService).runOnce();

    const statuses = await db.query(`SELECT id, status FROM holds WHERE owner_sub = $1`, [owner]);
    expect(statuses).toEqual(expect.arrayContaining([{ id: expired, status: 'EXPIRED' }, { id: active, status: 'HELD' }]));
    const [{ count }] = await db.query(`SELECT count(*)::int AS count FROM idempotency_records WHERE owner_sub = $1`, [owner]);
    expect(count).toBe(1);
  });
});
