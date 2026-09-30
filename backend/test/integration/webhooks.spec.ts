import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { createServer, IncomingHttpHeaders, Server } from 'http';
import { AddressInfo } from 'net';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { verifySignature } from '../../src/domain/webhook-rules';
import { WebhookDispatcherService } from '../../src/modules/events/webhook-dispatcher.service';
import { createApp, futureDate, useContract } from '../contract/contract-app';

/**
 * Webhooks de punta a punta: suscripción por la API del contrato, orden real, outbox, dispatcher y un
 * receptor HTTP real que verifica la firma. Usa dos sistemas cliente propios (A y B) para aislarse de otros tests.
 */
useContract();

interface Received {
  headers: IncomingHttpHeaders;
  body: string;
}

describe('Webhooks — suscripciones (contrato) y entrega de eventos', () => {
  let app: INestApplication;
  let db: DataSource;
  let dispatcher: WebhookDispatcherService;
  let receiver: Server;
  let receiverUrl: string;
  let receiverStatus = 200;
  const received: Received[] = [];

  const clients = { A: `test-wh-a-${Date.now()}`, B: `test-wh-b-${Date.now()}` };
  const SECRET = 'cliente-de-prueba-2026';
  const tokens: Record<'A' | 'B', string> = { A: '', B: '' };
  const subscriptionSecret = 'secreto-del-suscriptor-2026';
  const createdSubscriptions: string[] = [];
  const offsetDays = 30 + Math.floor(Math.random() * 200);

  beforeAll(async () => {
    receiver = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        received.push({ headers: req.headers, body });
        res.statusCode = receiverStatus;
        res.end();
      });
    });
    await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve));
    receiverUrl = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}/hook`;

    app = await createApp();
    db = app.get(DataSource);
    dispatcher = app.get(WebhookDispatcherService);
    for (const key of ['A', 'B'] as const) {
      await db.query(
        `INSERT INTO api_clients (client_id, client_secret_hash, name, scopes) VALUES ($1, $2, 'Test webhooks', $3)`,
        [clients[key], await bcrypt.hash(SECRET, 4), ['autos:read', 'autos:book', 'autos:cancel', 'autos:webhooks']],
      );
      const res = await http().post('/oauth2/token').type('form')
        .send({ grant_type: 'client_credentials', client_id: clients[key], client_secret: SECRET });
      tokens[key] = res.body.access_token;
    }
  });

  afterAll(async () => {
    const owners = Object.values(clients).map((c) => `client:${c}`);
    await db.query(
      `DELETE FROM webhook_deliveries WHERE event_id IN (
         SELECT e.id FROM outbox_events e JOIN reservations r ON r.id::text = e.resource_id WHERE r.owner_sub = ANY($1))`, [owners]);
    await db.query(`DELETE FROM webhook_subscriptions WHERE owner_sub = ANY($1)`, [owners]);
    await db.query(`DELETE FROM outbox_events WHERE resource_id IN (SELECT id::text FROM reservations WHERE owner_sub = ANY($1))`, [owners]);
    for (const table of ['reservations', 'order_previews', 'holds', 'idempotency_records']) {
      await db.query(`DELETE FROM ${table} WHERE owner_sub = ANY($1)`, [owners]);
    }
    await db.query(`DELETE FROM api_clients WHERE client_id = ANY($1)`, [Object.values(clients)]);
    await app?.close();
    await new Promise((resolve) => receiver.close(resolve));
  });

  function http() {
    return request(app.getHttpServer());
  }
  const as = (key: 'A' | 'B') => ({ Authorization: `Bearer ${tokens[key]}` });

  async function subscribe(key: 'A' | 'B', events: string[], extra: Record<string, unknown> = {}) {
    const id = randomUUID();
    createdSubscriptions.push(id);
    return http().post('/autos/v1/webhooks').set(as(key)).send({ id, url: receiverUrl, events, ...extra });
  }

  /** Crea una orden real por la API de integración (search → preview → create). */
  async function createOrder(key: 'A' | 'B', day: number): Promise<string> {
    const search = await http().post('/autos/v1/search').set('X-Affiliate-Id', '1001').send({
      booker: { country: 'ec' }, currency: 'USD', driver: { age: 35 },
      route: {
        pickup: { datetime: futureDate(day), location: { airport: 'GYE' } },
        dropoff: { datetime: futureDate(day + 2), location: { airport: 'GYE' } },
      },
    });
    const preview = await http().post('/autos/v1/orders/preview').set(as(key))
      .send({ vehicle_id: search.body.data[0].vehicle_id, search_token: search.body.search_token });
    const created = await http().post('/autos/v1/orders/create').set(as(key)).set('Idempotency-Key', randomUUID()).send({
      order_preview_id: preview.body.data.order_preview_id,
      payment_reference: `PAY-${randomUUID().slice(0, 8)}`,
      driver_details: { first_name: 'Eva', last_name: 'Luna', email: 'eva@correo.ec' },
    });
    expect(created.status).toBe(201);
    return created.body.order_id;
  }

  const deliveriesFor = (orderId: string) => received.filter((r) => JSON.parse(r.body).resourceId === orderId);

  describe('Suscripciones (contrato)', () => {
    it('POST /webhooks 201 devuelve el secret generado una sola vez; GET 200 no lo expone', async () => {
      const created = await subscribe('A', ['CAR_ORDER_CONFIRMED', 'CAR_ORDER_CANCELLED']);
      expect(created.status).toBe(201);
      expect(created).toSatisfyApiSpec();
      expect(created.body.secret).toEqual(expect.any(String));

      const list = await http().get('/autos/v1/webhooks').set(as('A'));
      expect(list.status).toBe(200);
      expect(list).toSatisfyApiSpec();
      expect(list.body.find((s: { id: string }) => s.id === created.body.id)).toEqual({
        id: created.body.id, url: receiverUrl, events: ['CAR_ORDER_CONFIRMED', 'CAR_ORDER_CANCELLED'],
      });

      // Otro sistema no ve las suscripciones ajenas
      const other = await http().get('/autos/v1/webhooks').set(as('B'));
      expect(other.body.find((s: { id: string }) => s.id === created.body.id)).toBeUndefined();

      const removed = await http().delete(`/autos/v1/webhooks/${created.body.id}`).set(as('A'));
      expect(removed.status).toBe(204);
      expect(removed).toSatisfyApiSpec();
      await http().delete(`/autos/v1/webhooks/${created.body.id}`).set(as('A')).expect(404);
    });

    it('rechaza eventos fuera del enum, id duplicado y falta de scope', async () => {
      const invalid = await subscribe('A', ['CAR_ORDER_EXPLODED']);
      expect(invalid.status).toBe(400);
      expect(invalid.body.code).toBe('VALIDATION_FAILED');

      const first = await subscribe('A', ['DEPOT_UPDATE'], { secret: subscriptionSecret });
      const duplicate = await http().post('/autos/v1/webhooks').set(as('A')).send({ id: first.body.id, url: receiverUrl, events: ['DEPOT_UPDATE'] });
      expect(duplicate.status).toBe(409);
      await http().delete(`/autos/v1/webhooks/${first.body.id}`).set(as('A')).expect(204);

      const readOnly = await http().post('/oauth2/token').type('form')
        .send({ grant_type: 'client_credentials', client_id: clients.A, client_secret: SECRET, scope: 'autos:read' });
      await http().get('/autos/v1/webhooks').set('Authorization', `Bearer ${readOnly.body.access_token}`).expect(403);
    });
  });

  describe('Entrega (outbox → dispatcher → receptor)', () => {
    it('CAR_ORDER_CONFIRMED y CAR_ORDER_CANCELLED llegan firmados con el WebhookPayload del contrato', async () => {
      await subscribe('A', ['CAR_ORDER_CONFIRMED', 'CAR_ORDER_CANCELLED'], { secret: subscriptionSecret });
      const orderId = await createOrder('A', offsetDays);

      await dispatcher.runOnce();
      const [confirmed] = deliveriesFor(orderId);
      expect(confirmed).toBeDefined();
      const payload = JSON.parse(confirmed.body);
      expect(payload).toEqual({
        eventId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        eventType: 'CAR_ORDER_CONFIRMED',
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        resourceId: orderId,
        data: expect.objectContaining({ order_id: orderId, status: 'CONFIRMED' }),
      });
      expect(confirmed.headers['x-webhook-event-id']).toBe(payload.eventId);
      expect(verifySignature(confirmed.body, subscriptionSecret, String(confirmed.headers['x-hub-signature-256']))).toBe(true);

      await http().post(`/autos/v1/orders/${orderId}/cancel`).set(as('A')).set('Idempotency-Key', randomUUID()).expect(200);
      await dispatcher.runOnce();
      expect(deliveriesFor(orderId).map((r) => JSON.parse(r.body).eventType)).toEqual(['CAR_ORDER_CONFIRMED', 'CAR_ORDER_CANCELLED']);

      // Un segundo ciclo no reenvía lo ya entregado
      await dispatcher.runOnce();
      expect(deliveriesFor(orderId)).toHaveLength(2);
    });

    it('un sistema NO recibe eventos de órdenes de otro sistema', async () => {
      await subscribe('A', ['CAR_ORDER_CONFIRMED'], { secret: subscriptionSecret });
      const orderOfB = await createOrder('B', offsetDays + 5);
      await dispatcher.runOnce();
      expect(deliveriesFor(orderOfB)).toHaveLength(0);
    });

    it('si el receptor falla: FAILED con reintento programado; tras 6 intentos, DEAD', async () => {
      await subscribe('B', ['CAR_ORDER_CONFIRMED'], { secret: subscriptionSecret });
      receiverStatus = 500;
      const orderId = await createOrder('B', offsetDays + 10);
      await dispatcher.runOnce();

      const deliveryOf = async () => (await db.query(
        `SELECT d.id, d.status, d.attempt, d.response_code, d.next_attempt_at FROM webhook_deliveries d
           JOIN outbox_events e ON e.id = d.event_id WHERE e.resource_id = $1`, [orderId]))[0];
      let delivery = await deliveryOf();
      expect(delivery).toMatchObject({ status: 'FAILED', attempt: 1, response_code: 500 });
      expect(new Date(delivery.next_attempt_at).getTime()).toBeGreaterThan(Date.now() + 50_000); // ~1 min

      // Simula que pasan los tiempos de espera: 5 fallos más → DEAD
      for (let i = 0; i < 5; i++) {
        await db.query(`UPDATE webhook_deliveries SET next_attempt_at = now() WHERE id = $1`, [delivery.id]);
        await dispatcher.runOnce();
      }
      delivery = await deliveryOf();
      expect(delivery).toMatchObject({ status: 'DEAD', attempt: 6 });
      receiverStatus = 200;
    });

    it('un reintento exitoso deja la entrega en SUCCEEDED', async () => {
      await subscribe('B', ['CAR_ORDER_CONFIRMED'], { secret: subscriptionSecret });
      receiverStatus = 503;
      const orderId = await createOrder('B', offsetDays + 15);
      await dispatcher.runOnce();
      receiverStatus = 200;
      await db.query(
        `UPDATE webhook_deliveries SET next_attempt_at = now()
          WHERE event_id IN (SELECT id FROM outbox_events WHERE resource_id = $1)`, [orderId]);
      await dispatcher.runOnce();
      const [delivery] = await db.query(
        `SELECT d.status, d.attempt FROM webhook_deliveries d JOIN outbox_events e ON e.id = d.event_id WHERE e.resource_id = $1`, [orderId]);
      expect(delivery).toEqual({ status: 'SUCCEEDED', attempt: 2 });
    });
  });
});
