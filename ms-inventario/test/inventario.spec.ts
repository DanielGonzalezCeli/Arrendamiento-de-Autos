import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as amqp from 'amqplib';
import { createPrivateKey, randomUUID } from 'crypto';
import { SignJWT } from 'jose';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { FleetEventsConsumer } from '../src/messaging/fleet-events.consumer';
import { VehicleStock } from '../src/stock/stock-message';
import { StockSyncService } from '../src/stock/stock-sync.service';
import { FAKE_BOOKING_GRPC_PORT } from './setup-env';

interface Pushed {
  service_id: string;
  item_id: string;
  date: string;
  time_slot: string;
  available_units: number;
  slot_id: string;
  timestamp: number;
  cid: string;
}

/** Booking simulado: implementa PushStockUpdate del inventory.proto oficial. `reject` hace que responda con error. */
async function startFakeBooking(received: Pushed[], behaviour: { reject: boolean }): Promise<grpc.Server> {
  const definition = protoLoader.loadSync(process.env.INVENTORY_PROTO_PATH!, { keepCase: true, longs: Number, enums: String, defaults: true, oneofs: true });
  const proto = grpc.loadPackageDefinition(definition) as unknown as { inventory: { InventoryStockService: { service: grpc.ServiceDefinition } } };
  const server = new grpc.Server();
  server.addService(proto.inventory.InventoryStockService.service, {
    PushStockUpdate: (call: grpc.ServerUnaryCall<Pushed, unknown>, callback: grpc.sendUnaryData<unknown>) => {
      if (behaviour.reject) return callback({ code: grpc.status.UNAVAILABLE, details: 'Booking caído (simulado)' } as grpc.ServiceError, null);
      received.push({ ...call.request, cid: String(call.metadata.get('x-correlation-id')[0] ?? '') });
      callback(null, { success: true, message: 'Stock actualizado', error_code: 'OK', current_available: call.request.available_units });
    },
  });
  await new Promise<void>((ok, fail) =>
    server.bindAsync(`127.0.0.1:${FAKE_BOOKING_GRPC_PORT}`, grpc.ServerCredentials.createInsecure(), (error) => (error ? fail(error) : ok())));
  return server;
}

async function waitFor<T>(probe: () => T | undefined, timeoutMs = 10_000): Promise<T> {
  const started = Date.now();
  for (;;) {
    const value = probe();
    if (value !== undefined) return value;
    if (Date.now() - started > timeoutMs) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 100));
  }
}

function adminToken(role = 'ADMIN'): Promise<string> {
  return new SignJWT({ email: 'admin@rutalibre.test', role })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer('rutalibre-identidad').setAudience('rutalibre-internal-api').setSubject(randomUUID())
    .setIssuedAt().setExpirationTime('1h')
    .sign(createPrivateKey(process.env.TEST_IDENTITY_PRIVATE_KEY!));
}

/**
 * ms-inventario con BD y Booking simulado por gRPC. Los autos de prueba se llaman auto-tst-NNNN para no tocar el
 * estado de los autos reales. La parte con RabbitMQ real corre solo si se define AMQP_TEST_URL (CI).
 */
describe('ms-inventario', () => {
  let app: INestApplication;
  let booking: grpc.Server;
  let stock: StockSyncService;
  const received: Pushed[] = [];
  const behaviour = { reject: false };
  const plate = () => `auto-tst-${String(Math.floor(Math.random() * 9000) + 1000)}`;
  const at = (iso: string) => new Date(iso);
  const vehicle = (id: string, overrides: Partial<VehicleStock> = {}): VehicleStock =>
    ({ vehicle_id: id, state: 'DISPONIBLE', available_units: 1, date: '2026-11-11', time_slot: '10:00', ...overrides });

  beforeAll(async () => {
    booking = await startFakeBooking(received, behaviour);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    stock = app.get(StockSyncService);
  });

  afterAll(async () => {
    const db = app.get(DataSource);
    await db.query(`DELETE FROM inventario.stock_sync_log WHERE item_id LIKE 'auto-tst-%'`);
    await db.query(`DELETE FROM inventario.stock_sync_state WHERE item_id LIKE 'auto-tst-%'`);
    await app?.close();
    booking?.forceShutdown();
  });

  it('snapshot: envía cada auto una vez; el mismo snapshot otra vez no reenvía nada', async () => {
    const [a, b] = [plate(), plate()];
    const first = await stock.apply([vehicle(a), vehicle(b, { state: 'EN_MANTENIMIENTO', available_units: 0 })], at('2026-11-11T15:00:00Z'), 'cid-snap-1');
    expect(first).toMatchObject({ checked: 2, pushed: 2, failed: 0 });
    expect(received.find((m) => m.item_id === a)).toMatchObject({ service_id: 'NODE_AUT_RUTALIBRE', available_units: 1, slot_id: 'slot-20261111-1000', cid: 'cid-snap-1' });
    expect(received.find((m) => m.item_id === b)).toMatchObject({ available_units: 0 });

    const again = await stock.apply([vehicle(a), vehicle(b, { state: 'EN_MANTENIMIENTO', available_units: 0 })], at('2026-11-11T15:00:30Z'), 'cid-snap-2');
    expect(again).toMatchObject({ checked: 2, pushed: 0 });
  });

  it('reserva: 0 unidades con la fecha y hora de retiro y el correlation id de la reserva; timestamps crecientes', async () => {
    const id = plate();
    await stock.apply([vehicle(id)], at('2026-11-11T15:00:00Z'), 'cid-a');
    await stock.apply([vehicle(id, { state: 'RESERVADO', available_units: 0, date: '2026-11-20', time_slot: '09:30' })], at('2026-11-11T15:01:00Z'), 'cid-reserva-1');
    const pushes = received.filter((m) => m.item_id === id);
    expect(pushes.at(-1)).toMatchObject({ available_units: 0, date: '2026-11-20', time_slot: '09:30', slot_id: 'slot-20261120-0930', cid: 'cid-reserva-1' });
    expect(pushes.at(-1)!.timestamp).toBeGreaterThan(pushes[0].timestamp);
  });

  it('un evento más viejo que el último aplicado se ignora para ese auto (llegada fuera de orden)', async () => {
    const id = plate();
    await stock.apply([vehicle(id, { state: 'RESERVADO', available_units: 0, date: '2026-11-25', time_slot: '10:00' })], at('2026-11-11T15:05:00Z'), 'cid-nuevo');
    const before = received.filter((m) => m.item_id === id).length;
    const stale = await stock.apply([vehicle(id)], at('2026-11-11T15:04:59Z'), 'cid-snapshot-viejo');
    expect(stale).toMatchObject({ stale: 1, pushed: 0 });
    expect(received.filter((m) => m.item_id === id)).toHaveLength(before);
  });

  it('si Booking falla, queda registrado y el siguiente snapshot lo reintenta', async () => {
    const id = plate();
    behaviour.reject = true;
    try {
      expect(await stock.apply([vehicle(id)], at('2026-11-11T15:10:00Z'), 'cid-falla')).toMatchObject({ pushed: 0, failed: 1 });
    } finally {
      behaviour.reject = false;
    }
    const [state] = await app.get(DataSource).query(`SELECT last_success, last_error_code, attempts FROM inventario.stock_sync_state WHERE item_id = $1`, [id]);
    expect(state).toMatchObject({ last_success: false, last_error_code: 'TRANSPORT_ERROR', attempts: 1 });
    expect(await stock.apply([vehicle(id)], at('2026-11-11T15:10:30Z'), 'cid-reintento')).toMatchObject({ pushed: 1 });
  });

  it('API interna para el panel: solo ADMIN; muestra modo, estado y últimos envíos', async () => {
    await request(app.getHttpServer()).get('/internal/stock').expect(401);
    await request(app.getHttpServer()).get('/internal/stock').set('Authorization', `Bearer ${await adminToken('CUSTOMER')}`).expect(403);
    const res = await request(app.getHttpServer()).get('/internal/stock').set('Authorization', `Bearer ${await adminToken()}`).expect(200);
    expect(res.body).toMatchObject({ mode: 'grpc', active: true, sync: { tracked: expect.any(Number) }, broker: { exchange: expect.stringContaining('rutalibre.eventos') } });
    expect(res.body.pushes[0]).toMatchObject({ transport: 'grpc', itemId: expect.stringMatching(/^auto-/) });
  });

  it('/health informa la BD y el broker', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toMatchObject({ service: 'ms-inventario', database: 'up', broker: process.env.AMQP_TEST_URL ? 'up' : 'down' });
  });

  const withBroker = process.env.AMQP_TEST_URL ? it : it.skip;

  withBroker('RabbitMQ: un evento publicado en el exchange llega a Booking; uno inválido termina en la cola de muertos', async () => {
    const consumer = app.get(FleetEventsConsumer);
    await waitFor(() => (consumer.connected ? true : undefined));
    const connection = await amqp.connect(process.env.AMQP_TEST_URL!);
    const channel = await connection.createConfirmChannel();
    try {
      const id = plate();
      const event = {
        specversion: '1.0', id: randomUUID(), type: 'ec.rutalibre.flota.estado_cambiado', source: 'ms-reservas', time: new Date().toISOString(),
        correlationid: 'cid-rabbit-1', data: { vehicles: [vehicle(id, { state: 'RESERVADO', available_units: 0, date: '2026-12-01', time_slot: '08:00' })] },
      };
      channel.publish(consumer.exchange, 'flota.estado_cambiado', Buffer.from(JSON.stringify(event)), { persistent: true, contentType: 'application/json' });
      await channel.waitForConfirms();
      const pushed = await waitFor(() => received.find((m) => m.item_id === id));
      expect(pushed).toMatchObject({ available_units: 0, date: '2026-12-01', time_slot: '08:00', cid: 'cid-rabbit-1' });

      channel.publish(consumer.exchange, 'flota.snapshot', Buffer.from('esto no es un evento'), { persistent: true });
      await channel.waitForConfirms();
      let dead: amqp.GetMessage | false = false;
      for (let i = 0; i < 50 && !dead; i++) {
        dead = await channel.get(`${consumer.queue}.dlq`, { noAck: true });
        if (!dead) await new Promise((r) => setTimeout(r, 100));
      }
      expect(dead && dead.content.toString()).toBe('esto no es un evento');
    } finally {
      await channel.deleteQueue(`${consumer.queue}.dlq`).catch(() => undefined);
      await channel.deleteQueue(consumer.queue).catch(() => undefined);
      await channel.deleteExchange(`${consumer.exchange}.dlx`).catch(() => undefined);
      await channel.deleteExchange(consumer.exchange).catch(() => undefined);
      await connection.close();
    }
  }, 30_000);
});
