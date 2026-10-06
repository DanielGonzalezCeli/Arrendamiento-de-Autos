import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createApp, futureDate } from '../contract/contract-app';

/** Panel de administración: protección por rol, consultas y operación de entrega/devolución/cancelación. */
describe('API interna — administración', () => {
  let app: INestApplication;
  let adminToken: string;
  let customerToken: string;
  const suffix = Date.now();
  const customerEmail = `test+admincust${suffix}@rutalibre.test`;
  const plate = `ZZT-${String(suffix).slice(-4)}`;
  const startDay = 30 + Math.floor(Math.random() * 200);

  const http = () => request(app.getHttpServer());
  const admin = () => ({ Authorization: `Bearer ${adminToken}` });
  const customer = () => ({ Authorization: `Bearer ${customerToken}` });

  beforeAll(async () => {
    app = await createApp();
    const login = await http().post('/api/auth/login').send({ email: 'admin@rutalibre.ec', password: 'Admin12345!' }).expect(200);
    adminToken = login.body.accessToken;
    const reg = await http().post('/api/auth/register')
      .send({ email: customerEmail, password: 'Prueba2026', firstName: 'Luis', lastName: 'Mora' }).expect(201);
    customerToken = reg.body.accessToken;
  });

  afterAll(async () => {
    const db = app.get(DataSource);
    const [user] = await db.query(`SELECT id FROM users WHERE email = $1`, [customerEmail]);
    if (user) {
      const sub = `user:${user.id}`;
      await db.query(`DELETE FROM webhook_deliveries WHERE event_id IN (SELECT e.id FROM outbox_events e JOIN reservations r ON r.id::text = e.resource_id WHERE r.owner_sub = $1)`, [sub]);
      await db.query(`DELETE FROM outbox_events WHERE resource_id IN (SELECT id::text FROM reservations WHERE owner_sub = $1)`, [sub]);
      for (const table of ['reservations', 'order_previews', 'holds', 'idempotency_records']) {
        await db.query(`DELETE FROM ${table} WHERE owner_sub = $1`, [sub]);
      }
      await db.query(`DELETE FROM users WHERE id = $1`, [user.id]);
    }
    await db.query(`DELETE FROM vehicle_blocks WHERE fleet_unit_id IN (SELECT id FROM fleet_units WHERE plate = $1)`, [plate]);
    await db.query(`DELETE FROM fleet_units WHERE plate = $1`, [plate]);
    await app?.close();
  });

  async function book(day: number) {
    const search = await http().post('/api/search').send({
      pickupAirport: 'UIO', pickupAt: futureDate(day), dropoffAt: futureDate(day + 3), driverAge: 35,
    }).expect(200);
    const offer = search.body.offers[0];
    const hold = await http().post('/api/checkout/hold').set(customer())
      .send({ searchToken: search.body.searchToken, vehicleId: offer.vehicle.id }).expect(200);
    const preview = await http().post('/api/checkout/preview').set(customer())
      .send({ searchToken: search.body.searchToken, vehicleId: offer.vehicle.id, holdId: hold.body.holdId, extras: [] }).expect(200);
    const confirmed = await http().post('/api/checkout/confirm').set(customer()).set('Idempotency-Key', randomUUID())
      .send({ orderPreviewId: preview.body.orderPreviewId, driver: { firstName: 'Luis', lastName: 'Mora', email: 'luis@correo.ec' }, paymentToken: 'tok_sim_visa_4242_admintest1' })
      .expect(201);
    return confirmed.body as { id: string; locator: string };
  }

  it('sin sesión → 401; cliente → 403', async () => {
    await http().get('/api/admin/dashboard').expect(401);
    const res = await http().get('/api/admin/dashboard').set(customer()).expect(403);
    expect(res.body).toMatchObject({ status: 403, code: 'VALIDATION_FAILED' });
  });

  it.each(['dashboard', 'reservations', 'models', 'fleet', 'depots', 'cities', 'categories', 'suppliers', 'extras', 'rates', 'users', 'integration'])(
    'GET /api/admin/%s responde 200', async (path) => {
      await http().get(`/api/admin/${path}`).set(admin()).expect(200);
    },
  );

  it('entrega (asigna placa) → devolución, con historial', async () => {
    const booking = await book(startDay);

    const found = await http().get('/api/admin/reservations').query({ q: booking.locator }).set(admin()).expect(200);
    expect(found.body.map((r: { id: string }) => r.id)).toEqual([booking.id]);

    const detail = await http().get(`/api/admin/reservations/${booking.id}`).set(admin()).expect(200);
    expect(detail.body.actions).toMatchObject({ pickUp: true, return: false });
    expect(detail.body.freeUnits.length).toBeGreaterThan(0);

    const picked = await http().post(`/api/admin/reservations/${booking.id}/pickup`).set(admin()).send({}).expect(200);
    expect(picked.body).toMatchObject({ rentalStatus: 'PICKED_UP', actions: { pickUp: false, return: true } });
    expect(picked.body.fleetUnitId).toBeTruthy();

    // Una segunda entrega no procede
    await http().post(`/api/admin/reservations/${booking.id}/pickup`).set(admin()).send({}).expect(409);
    // El kilometraje no puede retroceder
    await http().post(`/api/admin/reservations/${booking.id}/return`).set(admin()).send({ mileage: 0 }).expect(400);

    const returned = await http().post(`/api/admin/reservations/${booking.id}/return`).set(admin()).send({}).expect(200);
    expect(returned.body.rentalStatus).toBe('RETURNED');
    expect(returned.body.history.length).toBeGreaterThanOrEqual(3);
  });

  it('el administrador cancela la reserva de un cliente', async () => {
    const booking = await book(startDay + 10);
    const cancelled = await http().post(`/api/admin/reservations/${booking.id}/cancel`).set(admin()).expect(200);
    expect(cancelled.body.status).toBe('CANCELLED');
    const mine = await http().get(`/api/me/reservations/${booking.id}`).set(customer()).expect(200);
    expect(mine.body.status).toBe('CANCELLED');
  });

  it('flota: alta de placa, validación y bloqueo de mantenimiento', async () => {
    const [model] = (await http().get('/api/admin/models').set(admin()).expect(200)).body;
    const [depot] = (await http().get('/api/admin/depots').set(admin()).expect(200)).body;
    const base = { vehicleModelId: model.id, depotId: depot.id, year: 2024, mileage: 1000, status: 'AVAILABLE' };

    await http().post('/api/admin/fleet').set(admin()).send({ ...base, plate: '1234-ABC' }).expect(400);
    const unit = (await http().post('/api/admin/fleet').set(admin()).send({ ...base, plate: plate.toLowerCase() }).expect(201)).body;
    expect(unit.plate).toBe(plate);
    await http().post('/api/admin/fleet').set(admin()).send({ ...base, plate }).expect(409);

    const block = await http().post(`/api/admin/fleet/${unit.id}/blocks`).set(admin())
      .send({ startsAt: futureDate(startDay + 40), endsAt: futureDate(startDay + 42), reason: 'Mantenimiento preventivo' }).expect(201);
    expect((await http().get(`/api/admin/fleet/${unit.id}/blocks`).set(admin()).expect(200)).body).toHaveLength(1);
    await http().delete(`/api/admin/blocks/${block.body.id}`).set(admin()).expect(204);
  });

  it('el administrador no puede quitarse su propio rol', async () => {
    const me = await http().get('/api/auth/me').set(admin()).expect(200);
    await http().patch(`/api/admin/users/${me.body.id}`).set(admin()).send({ role: 'CUSTOMER' }).expect(409);
    await http().patch(`/api/admin/users/${me.body.id}`).set(admin()).send({ role: 'ROOT' }).expect(400);
  });
});
