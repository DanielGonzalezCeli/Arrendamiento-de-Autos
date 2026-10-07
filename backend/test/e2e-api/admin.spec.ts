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
  const diagModel = `Modelo ${suffix}`;
  const uploadedImages: string[] = [];
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
    await db.query(`DELETE FROM fleet_units WHERE vehicle_model_id IN (SELECT id FROM vehicle_models WHERE make = 'Diagnóstico' AND model = $1)`, [diagModel]);
    await db.query(`DELETE FROM vehicle_models WHERE make = 'Diagnóstico' AND model = $1`, [diagModel]);
    if (uploadedImages.length) await db.query(`DELETE FROM media_images WHERE id = ANY($1)`, [uploadedImages]);
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

  it('una placa devuelta queda libre para otro alquiler en las mismas fechas (devolución anticipada)', async () => {
    const first = await book(startDay + 60);
    const picked = await http().post(`/api/admin/reservations/${first.id}/pickup`).set(admin()).send({}).expect(200);
    await http().post(`/api/admin/reservations/${first.id}/return`).set(admin()).send({}).expect(200);

    // Otra reserva del mismo modelo en el mismo periodo: la placa devuelta aparece libre y se puede entregar
    const second = await book(startDay + 60);
    const detail = await http().get(`/api/admin/reservations/${second.id}`).set(admin()).expect(200);
    expect(detail.body.freeUnits.map((u: { id: string }) => u.id)).toContain(picked.body.fleetUnitId);
    await http().post(`/api/admin/reservations/${second.id}/pickup`).set(admin()).send({ fleetUnitId: picked.body.fleetUnitId }).expect(200);
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

  it('una unidad solo puede estar en una agencia del proveedor de su modelo', async () => {
    const models = (await http().get('/api/admin/models').set(admin()).expect(200)).body;
    const depots = (await http().get('/api/admin/depots').set(admin()).expect(200)).body;
    const model = models[0];
    const otherDepot = depots.find((d: { supplierId: number }) => d.supplierId !== model.supplierId);
    const res = await http().post('/api/admin/fleet').set(admin())
      .send({ vehicleModelId: model.id, depotId: otherDepot.id, plate: 'ZZX-9999', year: 2024, mileage: 0, status: 'AVAILABLE' })
      .expect(400);
    expect(res.body.invalidParams).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'depotId' })]));
  });

  it('el listado de modelos explica por qué un modelo no aparece en la búsqueda', async () => {
    const models = (await http().get('/api/admin/models').set(admin()).expect(200)).body;
    const seeded = models.find((m: { make: string; model: string }) => m.make === 'Kia' && m.model === 'Picanto');
    expect(seeded.searchIssues).toEqual([]);

    const template = models[0];
    const created = (await http().post('/api/admin/models').set(admin()).send({
      supplierId: template.supplierId, categoryId: template.categoryId, make: 'Diagnóstico', model: diagModel,
      transmission: 'MANUAL', fuelType: 'GASOLINE', fuelPolicy: 'FULL_TO_FULL', seats: 5, doors: 4, bagCapacity: 2,
      airConditioning: true, published: false,
    }).expect(201)).body;
    const listed = (await http().get('/api/admin/models').set(admin()).expect(200)).body.find((m: { id: string }) => m.id === created.id);
    expect(listed.searchIssues).toEqual(expect.arrayContaining(['No está publicado', 'No tiene unidades en la flota']));
  });

  it('fotos: el admin sube una imagen y la web la lee; solo JPG/PNG/WebP reales', async () => {
    // PNG de 1×1 píxel
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const uploaded = await http().post('/api/admin/images').set(admin()).attach('file', png, 'foto.png').expect(201);
    expect(uploaded.body).toMatchObject({ contentType: 'image/png', url: `/api/images/${uploaded.body.id}` });
    uploadedImages.push(uploaded.body.id);

    const image = await http().get(uploaded.body.url).expect(200);
    expect(image.headers['content-type']).toBe('image/png');
    expect(image.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(Buffer.compare(image.body, png)).toBe(0);

    // Un SVG (puede llevar scripts) con nombre .png no se acepta: se mira el contenido, no la extensión
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    await http().post('/api/admin/images').set(admin()).attach('file', svg, { filename: 'falsa.png', contentType: 'image/png' }).expect(400);
    await http().post('/api/admin/images').set(customer()).attach('file', png, 'foto.png').expect(403);
    await http().get('/api/images/no-existe').expect(404);
  });

  it('el administrador no puede quitarse su propio rol', async () => {
    const me = await http().get('/api/auth/me').set(admin()).expect(200);
    await http().patch(`/api/admin/users/${me.body.id}`).set(admin()).send({ role: 'CUSTOMER' }).expect(409);
    await http().patch(`/api/admin/users/${me.body.id}`).set(admin()).send({ role: 'ROOT' }).expect(400);
  });
});
