import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { createApp, futureDate, useContract } from './contract-app';

/**
 * Tests de CONTRATO del flujo de órdenes (search → hold → preview → create → get → modify → cancel),
 * más idempotencia (RN24), concurrencia (RN10) y propiedad por `sub` (RN23). Requiere BD con el seed.
 */
useContract();

const CLIENT_SECRET = process.env.SEED_HUB_CLIENT_SECRET || 'hub-demo-secret-2026';
const ALL_SCOPES = 'autos:read autos:book autos:cancel autos:webhooks';

describe('Contrato autos-openapi.yaml — órdenes', () => {
  let app: INestApplication;
  let token: string;
  // Fechas futuras dentro de la vigencia de las tarifas del seed; los datos creados se borran al final.
  const offsetDays = 30 + Math.floor(Math.random() * 200);
  const startedAt = new Date();

  const OTHER_CLIENT = 'test-hub-b';
  const OTHER_SECRET = 'otro-cliente-secreto-2026';

  beforeAll(async () => {
    app = await createApp();
    token = await getToken(CLIENT_SECRET);
    // Segundo sistema cliente (otro `sub`) para probar competencia por el inventario y propiedad de órdenes.
    await app.get(DataSource).query(
      `INSERT INTO api_clients (client_id, client_secret_hash, name, scopes) VALUES ($1, $2, 'Cliente de prueba B', $3)
       ON CONFLICT (client_id) DO NOTHING`,
      [OTHER_CLIENT, await bcrypt.hash(OTHER_SECRET, 4), ['autos:read', 'autos:book', 'autos:cancel']],
    );
  });

  afterAll(async () => {
    const db = app.get(DataSource);
    await cleanUp(db, 'client:booking-hub-demo', startedAt);
    await cleanUp(db, `client:${OTHER_CLIENT}`, startedAt);
    await db.query(`DELETE FROM api_clients WHERE client_id = $1`, [OTHER_CLIENT]);
    await app?.close();
  });

  const http = () => request(app.getHttpServer());
  const auth = (t = token) => ({ Authorization: `Bearer ${t}` });

  async function getToken(secret: string, clientId = 'booking-hub-demo', scope = ALL_SCOPES): Promise<string> {
    const res = await request(app.getHttpServer()).post('/oauth2/token').type('form')
      .send({ grant_type: 'client_credentials', client_id: clientId, client_secret: secret, scope });
    return res.body.access_token;
  }

  /** Busca en UIO una categoría y devuelve el primer vehicle_id + search_token. */
  async function searchVehicle(carType: string, startDay = offsetDays, days = 3) {
    const res = await http().post('/autos/v1/search').set('X-Affiliate-Id', '1001').send({
      booker: { country: 'ec' },
      currency: 'USD',
      driver: { age: 35 },
      route: {
        pickup: { datetime: futureDate(startDay), location: { airport: 'UIO' } },
        dropoff: { datetime: futureDate(startDay + days), location: { airport: 'UIO' } },
      },
      filters: { car_types: [carType] },
    });
    expect(res.status).toBe(200);
    return { vehicleId: res.body.data[0]?.vehicle_id as string, searchToken: res.body.search_token as string, price: res.body.data[0]?.price };
  }

  async function createOrder(carType = 'SEDAN', startDay = offsetDays, extras: string[] = []) {
    const { vehicleId, searchToken } = await searchVehicle(carType, startDay);
    const preview = await http().post('/autos/v1/orders/preview').set(auth()).send({ vehicle_id: vehicleId, search_token: searchToken, extras });
    const key = randomUUID();
    const body = orderBody(preview.body.data.order_preview_id);
    const created = await http().post('/autos/v1/orders/create').set(auth()).set('Idempotency-Key', key).send(body);
    return { created, key, body, vehicleId, searchToken, preview };
  }

  const orderBody = (previewId: string) => ({
    order_preview_id: previewId,
    payment_reference: `PAY-${randomUUID().slice(0, 8)}`,
    driver_details: { first_name: 'Lucía', last_name: 'Mora', email: 'lucia.mora@correo.ec', phone_number: '0998765432' },
  });

  describe('Flujo completo', () => {
    it('hold 200 → preview 200 → create 201 → get 200, todo conforme al contrato', async () => {
      const { vehicleId, searchToken, price } = await searchVehicle('SEDAN');

      const hold = await http().post('/autos/v1/orders/hold').set(auth()).send({ vehicle_id: vehicleId, search_token: searchToken, driver: { age: 35 } });
      expect(hold.status).toBe(200);
      expect(hold).toSatisfyApiSpec();
      expect(hold.body.status).toBe('HELD');

      const preview = await http().post('/autos/v1/orders/preview').set(auth())
        .send({ vehicle_id: vehicleId, search_token: searchToken, hold_id: hold.body.hold_id, extras: ['GPS', 'CHILD_SEAT'] });
      expect(preview.status).toBe(200);
      expect(preview).toSatisfyApiSpec();
      expect(preview.body.data.total_price).toBeGreaterThan(price); // precio de búsqueda + extras
      expect(preview.body.data.breakdown.lines.map((l: { code: string }) => l.code).sort()).toEqual(['BASE', 'CHILD_SEAT', 'GPS']);

      const created = await http().post('/autos/v1/orders/create').set(auth()).set('Idempotency-Key', randomUUID())
        .send(orderBody(preview.body.data.order_preview_id));
      expect(created.status).toBe(201);
      expect(created).toSatisfyApiSpec();
      expect(created.body).toMatchObject({ status: 'CONFIRMED', total_price: preview.body.data.total_price, currency: 'USD' });
      expect(created.body.locator).toMatch(/^ANDES-[A-Z2-9]{6}$/);
      expect(created.body._links).toEqual({
        self: expect.stringMatching(/^https?:\/\/.+\/autos\/v1\/orders\/[0-9a-f-]{36}$/),
        modify: expect.stringMatching(/\/modify$/),
        cancel: expect.stringMatching(/\/cancel$/),
      });
      expect(created.body.vehicle_details.extras.map((e: { code: string }) => e.code).sort()).toEqual(['CHILD_SEAT', 'GPS']);

      const fetched = await http().get(`/autos/v1/orders/${created.body.order_id}`).set(auth());
      expect(fetched.status).toBe(200);
      expect(fetched).toSatisfyApiSpec();
      expect(fetched.body).toEqual(created.body);

      // EDA: el evento quedó en el outbox en la misma transacción que la orden.
      const events = await app.get(DataSource).query(`SELECT event_type FROM outbox_events WHERE resource_id = $1`, [created.body.order_id]);
      expect(events).toEqual([{ event_type: 'CAR_ORDER_CONFIRMED' }]);
    });

    it('modify 200: agrega un extra, quita otro y recalcula el total', async () => {
      const { created } = await createOrder('SEDAN', offsetDays + 10, ['GPS']);
      const res = await http().post(`/autos/v1/orders/${created.body.order_id}/modify`).set(auth()).set('Idempotency-Key', randomUUID())
        .send({ extras_to_add: ['CDW'], extras_to_remove: ['GPS'] });
      expect(res.status).toBe(200);
      expect(res).toSatisfyApiSpec();
      expect(res.body.vehicle_details.extras.map((e: { code: string }) => e.code)).toEqual(['CDW']);
      expect(res.body.total_price).not.toBe(created.body.total_price);
    });

    it('modify cambiando fechas (route) recalcula días y precio', async () => {
      const { created } = await createOrder('SEDAN', offsetDays + 20);
      const res = await http().post(`/autos/v1/orders/${created.body.order_id}/modify`).set(auth()).set('Idempotency-Key', randomUUID())
        .send({
          route: {
            pickup: { datetime: futureDate(offsetDays + 20), location: { airport: 'UIO' } },
            dropoff: { datetime: futureDate(offsetDays + 25), location: { airport: 'UIO' } },
          },
        });
      expect(res.status).toBe(200);
      expect(res).toSatisfyApiSpec();
      expect(res.body.route_details.rental_days).toBe(5);
      expect(res.body.total_price).toBeGreaterThan(created.body.total_price);
    });

    it('cancel 200 sin cuerpo; luego la orden está CANCELLED y sin links de acción', async () => {
      const { created } = await createOrder('SEDAN', offsetDays + 30);
      const cancel = await http().post(`/autos/v1/orders/${created.body.order_id}/cancel`).set(auth()).set('Idempotency-Key', randomUUID());
      expect(cancel.status).toBe(200);
      expect(cancel).toSatisfyApiSpec();
      expect(cancel.text).toBe('');

      const fetched = await http().get(`/autos/v1/orders/${created.body.order_id}`).set(auth());
      expect(fetched.body.status).toBe('CANCELLED');
      expect(Object.keys(fetched.body._links)).toEqual(['self']);
    });
  });

  describe('Idempotencia (Idempotency-Key)', () => {
    it('misma clave + mismo body → misma respuesta y UNA sola reserva', async () => {
      const { created, key, body } = await createOrder('SEDAN', offsetDays + 40);
      const retry = await http().post('/autos/v1/orders/create').set(auth()).set('Idempotency-Key', key).send(body);
      expect(retry.status).toBe(201);
      expect(retry.body).toEqual(created.body);
      expect(retry.headers['idempotent-replayed']).toBe('true');

      const [{ count }] = await app.get(DataSource).query(`SELECT count(*)::int AS count FROM reservations WHERE order_preview_id = $1`, [body.order_preview_id]);
      expect(count).toBe(1);
    });

    it('misma clave + otro body → 409', async () => {
      const { key, body } = await createOrder('SEDAN', offsetDays + 50);
      const res = await http().post('/autos/v1/orders/create').set(auth()).set('Idempotency-Key', key)
        .send({ ...body, payment_reference: 'OTRA-REFERENCIA-1' });
      expect(res.status).toBe(409);
      expect(res).toSatisfyApiSpec();
    });

    it('otra clave con la misma preview ya usada → 409', async () => {
      const { body } = await createOrder('SEDAN', offsetDays + 60);
      const res = await http().post('/autos/v1/orders/create').set(auth()).set('Idempotency-Key', randomUUID()).send(body);
      expect(res.status).toBe(409);
      expect(res).toSatisfyApiSpec();
    });

    it('cancel repetido con la misma clave → 200 (replay); con otra clave → 409 CANCELLATION_NOT_ALLOWED', async () => {
      const { created } = await createOrder('SEDAN', offsetDays + 70);
      const key = randomUUID();
      const url = `/autos/v1/orders/${created.body.order_id}/cancel`;
      await http().post(url).set(auth()).set('Idempotency-Key', key).expect(200);
      const replay = await http().post(url).set(auth()).set('Idempotency-Key', key);
      expect(replay.status).toBe(200);
      const again = await http().post(url).set(auth()).set('Idempotency-Key', randomUUID());
      expect(again.status).toBe(409);
      expect(again).toSatisfyApiSpec();
      expect(again.body.code).toBe('CANCELLATION_NOT_ALLOWED');
    });

    it('create sin Idempotency-Key → 400', async () => {
      const res = await http().post('/autos/v1/orders/create').set(auth()).send({});
      expect(res.status).toBe(400);
      expect(res).toSatisfyApiSpec();
    });
  });

  describe('Reglas de negocio', () => {
    it('modify de una orden cancelada → 409 BOOKING_NOT_CONFIRMED', async () => {
      const { created } = await createOrder('SEDAN', offsetDays + 80);
      await http().post(`/autos/v1/orders/${created.body.order_id}/cancel`).set(auth()).set('Idempotency-Key', randomUUID()).expect(200);
      const res = await http().post(`/autos/v1/orders/${created.body.order_id}/modify`).set(auth()).set('Idempotency-Key', randomUUID())
        .send({ extras_to_add: ['GPS'] });
      expect(res.status).toBe(409);
      expect(res).toSatisfyApiSpec();
      expect(res.body.code).toBe('BOOKING_NOT_CONFIRMED');
    });

    it('stock agotado: la Hilux de UIO tiene 1 unidad → el segundo hold es 409 CAR_NO_LONGER_AVAILABLE', async () => {
      const start = offsetDays + 90;
      const first = await searchVehicle('PICKUP', start);
      await http().post('/autos/v1/orders/hold').set(auth()).send({ vehicle_id: first.vehicleId, search_token: first.searchToken }).expect(200);

      const second = await searchVehicle('PICKUP', start);
      expect(second.vehicleId).toBeUndefined(); // la búsqueda ya no la ofrece mientras dure el hold

      const otherClient = await getToken(OTHER_SECRET, OTHER_CLIENT, 'autos:book');
      const res = await http().post('/autos/v1/orders/hold').set(auth(otherClient)).send({ vehicle_id: first.vehicleId, search_token: first.searchToken });
      expect(res.status).toBe(409);
      expect(res).toSatisfyApiSpec();
      expect(res.body.code).toBe('CAR_NO_LONGER_AVAILABLE');

      // El mismo dueño que repite el hold recibe el hold vigente (hold no lleva Idempotency-Key).
      const repeat = await http().post('/autos/v1/orders/hold').set(auth()).send({ vehicle_id: first.vehicleId, search_token: first.searchToken });
      expect(repeat.status).toBe(200);
    });

    it('otro sistema (otro sub) no puede ver ni cancelar una orden ajena → 404', async () => {
      const { created } = await createOrder('SEDAN', offsetDays + 95);
      const otherClient = await getToken(OTHER_SECRET, OTHER_CLIENT, 'autos:read autos:cancel');
      const get = await http().get(`/autos/v1/orders/${created.body.order_id}`).set(auth(otherClient));
      expect(get.status).toBe(404);
      const cancel = await http().post(`/autos/v1/orders/${created.body.order_id}/cancel`).set(auth(otherClient)).set('Idempotency-Key', randomUUID());
      expect(cancel.status).toBe(404);
    });

    it('concurrencia: 2 creates en paralelo sobre la última unidad → exactamente 1 éxito', async () => {
      const start = offsetDays + 100;
      const a = await searchVehicle('PICKUP', start);
      const [pa, pb] = await Promise.all([
        http().post('/autos/v1/orders/preview').set(auth()).send({ vehicle_id: a.vehicleId, search_token: a.searchToken }),
        http().post('/autos/v1/orders/preview').set(auth()).send({ vehicle_id: a.vehicleId, search_token: a.searchToken }),
      ]);
      const results = await Promise.all([
        http().post('/autos/v1/orders/create').set(auth()).set('Idempotency-Key', randomUUID()).send(orderBody(pa.body.data.order_preview_id)),
        http().post('/autos/v1/orders/create').set(auth()).set('Idempotency-Key', randomUUID()).send(orderBody(pb.body.data.order_preview_id)),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(results.find((r) => r.status === 409)!.body.code).toBe('CAR_NO_LONGER_AVAILABLE');
    });

    it('payment_reference inválida → 400 PAYMENT_REFERENCE_INVALID', async () => {
      const { vehicleId, searchToken } = await searchVehicle('SEDAN', offsetDays + 110);
      const preview = await http().post('/autos/v1/orders/preview').set(auth()).send({ vehicle_id: vehicleId, search_token: searchToken });
      const res = await http().post('/autos/v1/orders/create').set(auth()).set('Idempotency-Key', randomUUID())
        .send({ ...orderBody(preview.body.data.order_preview_id), payment_reference: 'x' });
      expect(res.status).toBe(400);
      expect(res).toSatisfyApiSpec();
      expect(res.body.code).toBe('PAYMENT_REFERENCE_INVALID');
    });

    it('extra inexistente en preview → 400 con invalidParams', async () => {
      const { vehicleId, searchToken } = await searchVehicle('SEDAN', offsetDays + 120);
      const res = await http().post('/autos/v1/orders/preview').set(auth()).send({ vehicle_id: vehicleId, search_token: searchToken, extras: ['JETPACK'] });
      expect(res.status).toBe(400);
      expect(res.body.invalidParams[0].name).toBe('extras');
    });

    it('search_token inexistente → 400', async () => {
      const res = await http().post('/autos/v1/orders/hold').set(auth()).send({ vehicle_id: randomUUID(), search_token: randomUUID() });
      expect(res.status).toBe(400);
      expect(res).toSatisfyApiSpec();
    });

    it('GET de una orden inexistente → 404', async () => {
      const res = await http().get(`/autos/v1/orders/${randomUUID()}`).set(auth());
      expect(res.status).toBe(404);
      expect(res).toSatisfyApiSpec();
    });
  });
});

/** Borra lo que creó esta ejecución (orden inverso a las FK). */
async function cleanUp(db: DataSource, ownerSub: string, since: Date) {
  await db.query(
    `DELETE FROM outbox_events WHERE resource_id IN (SELECT id::text FROM reservations WHERE owner_sub = $1 AND created_at >= $2)`,
    [ownerSub, since],
  );
  await db.query(`DELETE FROM reservations WHERE owner_sub = $1 AND created_at >= $2`, [ownerSub, since]);
  await db.query(`DELETE FROM order_previews WHERE owner_sub = $1 AND created_at >= $2`, [ownerSub, since]);
  await db.query(`DELETE FROM holds WHERE owner_sub = $1 AND created_at >= $2`, [ownerSub, since]);
  await db.query(`DELETE FROM idempotency_records WHERE owner_sub = $1 AND created_at >= $2`, [ownerSub, since]);
}
