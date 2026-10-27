import { FAKE_BOOKING_GRPC_PORT, TEST_API_KEY } from './v3-env';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { resolve } from 'path';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createApp } from '../contract/contract-app';

/** Fecha local "YYYY-MM-DD" dentro de `days` días. */
function day(days: number): string {
  return new Date(Date.now() + days * 24 * 3600_000).toISOString().slice(0, 10);
}

interface Pushed {
  service_id: string;
  item_id: string;
  date: string;
  time_slot: string;
  available_units: number;
  slot_id: string;
  timestamp: number;
}

/** Servidor gRPC que hace de Booking Prototipo: implementa PushStockUpdate del inventory.proto oficial. */
async function startFakeBooking(received: Pushed[]): Promise<grpc.Server> {
  const definition = protoLoader.loadSync(resolve(__dirname, '..', '..', '..', 'contracts', 'inventory.proto'), {
    keepCase: true, longs: Number, enums: String, defaults: true, oneofs: true,
  });
  const proto = grpc.loadPackageDefinition(definition) as unknown as {
    inventory: { InventoryStockService: { service: grpc.ServiceDefinition } };
  };
  const server = new grpc.Server();
  server.addService(proto.inventory.InventoryStockService.service, {
    PushStockUpdate: (call: grpc.ServerUnaryCall<Pushed, unknown>, callback: grpc.sendUnaryData<unknown>) => {
      received.push(call.request);
      callback(null, { success: true, message: 'Stock actualizado', error_code: 'OK', current_available: call.request.available_units });
    },
  });
  await new Promise<void>((ok, fail) =>
    server.bindAsync(`127.0.0.1:${FAKE_BOOKING_GRPC_PORT}`, grpc.ServerCredentials.createInsecure(), (error) => (error ? fail(error) : ok())));
  return server;
}

async function waitFor<T>(probe: () => T | undefined, timeoutMs = 8000): Promise<T> {
  const started = Date.now();
  for (;;) {
    const value = probe();
    if (value !== undefined) return value;
    if (Date.now() - started > timeoutMs) throw new Error('timeout esperando el PushStockUpdate');
    await new Promise((r) => setTimeout(r, 100));
  }
}

describe('Contrato v3 con Booking Prototipo (/api/v3) + PushStockUpdate por gRPC', () => {
  let app: INestApplication;
  let grpcServer: grpc.Server;
  const received: Pushed[] = [];
  const pnrs: string[] = [];
  const keys: string[] = [];
  const startDay = 40 + Math.floor(Math.random() * 200);

  beforeAll(async () => {
    grpcServer = await startFakeBooking(received);
    app = await createApp();
  });

  afterAll(async () => {
    const db = app.get(DataSource);
    const ids = (await db.query(`SELECT id::text FROM reservations WHERE locator = ANY($1)`, [pnrs])).map((r: { id: string }) => r.id);
    await db.query(`DELETE FROM webhook_deliveries WHERE event_id IN (SELECT id FROM outbox_events WHERE resource_id = ANY($1))`, [ids]);
    await db.query(`DELETE FROM outbox_events WHERE resource_id = ANY($1)`, [ids]);
    await db.query(`DELETE FROM reservations WHERE locator = ANY($1)`, [pnrs]);
    await db.query(`DELETE FROM idempotency_records WHERE idempotency_key = ANY($1)`, [keys]);
    // El servidor gRPC era simulado: se olvida lo "sincronizado" para que la próxima sincronización real envíe todo.
    await db.query(`DELETE FROM stock_sync_state`);
    await db.query(`DELETE FROM stock_sync_log`);
    await app?.close();
    grpcServer?.forceShutdown();
  });

  const http = () => request(app.getHttpServer());
  const key = () => {
    const k = randomUUID();
    keys.push(k);
    return k;
  };
  const driver = { full_name: 'Carlos Andrés Zambrano', email: 'carlos.zambrano@example.com', phone: '+593987654321', license_number: '1710034065', age: 30 };

  it('semáforo: GET /health y /autos/health responden HEALTHY sin credenciales', async () => {
    for (const path of ['/api/v3/health', '/api/v3/autos/health']) {
      const res = await http().get(path).expect(200);
      expect(res.body).toMatchObject({ status: 'HEALTHY', nodo_id: 'NODE_AUT_RUTALIBRE', vertical: 'AUTOS', sincronizacion_stock: 'grpc' });
      expect(res.headers['x-correlation-id']).toMatch(/^cid-aut-/);
    }
  });

  it('al arrancar envía el stock de toda la flota a Booking por gRPC', async () => {
    const first = await waitFor(() => received[0]);
    expect(first).toMatchObject({ service_id: 'NODE_AUT_RUTALIBRE' });
    expect(first.item_id).toMatch(/^auto-[a-z]{3}-\d{3,4}$/);
    expect(first.time_slot).toMatch(/^\d{2}:(00|30)$/);
    expect(first.slot_id).toBe(`slot-${first.date.replace(/-/g, '')}-${first.time_slot.replace(':', '')}`);
  });

  it('flujo completo: catálogo → reserva → reintento → 409 de la Saga → cancelación con reembolso 100 % → eventos', async () => {
    // Sincronizar (botón 📥 de Booking): { data: [...] } solo con autos DISPONIBLES
    const catalog = await http().get('/api/v3/autos').query({ limit: 100 }).expect(200);
    expect(catalog.body.data.length).toBeGreaterThan(0);
    expect(catalog.body.data.every((a: { estado: string }) => a.estado === 'DISPONIBLE')).toBe(true);
    expect((await http().get('/api/v3/autos').expect(200)).body.limit).toBe(10);
    const car = catalog.body.data[0];
    expect(car).toMatchObject({ vehicle_id: car.auto_id, moneda: 'USD', cleaning_cooldown: { cooldown_minutos: 120, activo: false } });

    const body = {
      vehicle_id: car.vehicle_id, pickup_date: day(startDay), dropoff_date: day(startDay + 3),
      pickup_time: '10:00', dropoff_time: '10:00', coverage_type: 'TOTAL', driver,
    };

    // Sin X-API-Key → 401 en formato v3
    const unauthorized = await http().post('/api/v3/reservas').set('X-Correlation-Id', 'cid-test-401').send(body).expect(401);
    expect(unauthorized.headers['content-type']).toContain('application/problem+json');
    expect(unauthorized.body).toMatchObject({ status: 401, code: 'UNAUTHORIZED', correlation_id: 'cid-test-401', instance: '/api/v3/reservas' });
    expect(unauthorized.body.timestamp).toBeDefined();

    // Sin Idempotency-Key → 400 MALFORMED_REQUEST
    await http().post('/api/v3/reservas').set('X-API-Key', TEST_API_KEY).send(body).expect(400)
      .expect((res) => expect(res.body.code).toBe('MALFORMED_REQUEST'));

    // Reserva → 201
    const idem = key();
    const created = await http().post('/api/v3/reservas').set('X-API-Key', TEST_API_KEY).set('Idempotency-Key', idem)
      .set('X-Correlation-Id', 'cid-test-reserva').send(body).expect(201);
    expect(created.body).toMatchObject({
      status: 'CONFIRMED', auto_id: car.vehicle_id, vehicle_id: car.vehicle_id, tipo_cobertura: 'TOTAL', deposito_garantia: 0,
      total_price: { currency: 'USD' },
    });
    const pnr: string = created.body.pnr;
    pnrs.push(pnr);
    expect(pnr).toMatch(/^CAR[A-Z2-9]{5}$/);
    expect(created.body.order_id).toBe(pnr);
    expect(created.body.voucher_qr_data).toBe(`BOOKING-CAR-${pnr}-${car.vehicle_id}-CONFIRMED`);
    expect(created.body.total_price.desglose.CDW).toBeGreaterThan(0);

    // Booking recibe available_units = 0 con la fecha y hora de retiro
    const reservedPush = await waitFor(() => received.find((m) => m.item_id === car.vehicle_id && m.available_units === 0));
    expect(reservedPush).toMatchObject({ date: day(startDay), time_slot: '10:00', slot_id: `slot-${day(startDay).replace(/-/g, '')}-1000` });

    // Reintento con la misma clave → misma respuesta, sin segunda reserva
    const replay = await http().post('/api/v3/autos/reservas').set('X-API-Key', TEST_API_KEY).set('Idempotency-Key', idem).send(body).expect(201);
    expect(replay.body.pnr).toBe(pnr);
    expect(replay.headers['idempotent-replayed']).toBe('true');

    // Misma clave con otro cuerpo → 400 IDEMPOTENCY_CONFLICT (no 409: no debe disparar la Saga)
    await http().post('/api/v3/reservas').set('X-API-Key', TEST_API_KEY).set('Idempotency-Key', idem)
      .send({ ...body, coverage_type: 'BASIC' }).expect(400)
      .expect((res) => expect(res.body.code).toBe('IDEMPOTENCY_CONFLICT'));

    // El mismo auto en fechas que se cruzan → 409 VEHICLE_UNAVAILABLE (dispara la compensación de la Saga)
    const conflict = await http().post('/api/v3/autos/orders/create').set('X-API-Key', TEST_API_KEY).set('Idempotency-Key', key())
      .send({ ...body, pickup_date: day(startDay + 1), dropoff_date: day(startDay + 5) }).expect(409);
    expect(conflict.body).toMatchObject({ status: 409, code: 'VEHICLE_UNAVAILABLE', type: 'https://booking.epn.edu.ec/errors/vehicle-unavailable' });

    // Validaciones semánticas → 422 (no disparan la Saga)
    await http().post('/api/v3/reservas').set('X-API-Key', TEST_API_KEY).set('Idempotency-Key', key())
      .send({ ...body, driver: { ...driver, age: 17 } }).expect(422)
      .expect((res) => expect(res.body.code).toBe('DRIVER_UNDERAGE'));
    await http().post('/api/v3/reservas').set('X-API-Key', TEST_API_KEY).set('Idempotency-Key', key())
      .send({ ...body, pickup_date: day(startDay + 3), dropoff_date: day(startDay) }).expect(422)
      .expect((res) => expect(res.body.code).toBe('INVALID_DATES'));
    await http().post('/api/v3/reservas').set('X-API-Key', TEST_API_KEY).set('Idempotency-Key', key())
      .send({ ...body, vehicle_id: 'auto-zzz-9999' }).expect(409);

    // Consulta por PNR y estado del auto
    const order = await http().get(`/api/v3/autos/orders/${pnr}`).set('X-API-Key', TEST_API_KEY).expect(200);
    expect(order.body).toMatchObject({ pnr, status: 'CONFIRMED', retiro: { fecha: day(startDay), hora: '10:00' } });
    const vehicle = await http().get(`/api/v3/autos/${car.vehicle_id}`).expect(200);
    expect(vehicle.body.estado).toBe('RESERVADO');

    // Compensación de la Saga → 200, reembolso del 100 %, auto liberado; un reintento devuelve lo mismo
    const cancelled = await http().post(`/api/v3/orders/${pnr}/cancel`).set('X-API-Key', TEST_API_KEY)
      .send({ motivo: 'Fallo en el vuelo', solicitante: 'SAGA_ORCHESTRATOR' }).expect(200);
    expect(cancelled.body).toMatchObject({
      pnr, status: 'CANCELLED', auto_id: car.vehicle_id,
      refund: { refund_id: `REF-AUTO-${pnr.slice(3)}`, amount: created.body.total_price.total, percentage: 100, status: 'PROCESSED' },
      inventory_restoration: { status: 'RESTORED', vehicle_id: car.vehicle_id, new_state: 'DISPONIBLE' },
    });
    const again = await http().post(`/api/v3/reservas/${pnr}/cancel`).set('X-API-Key', TEST_API_KEY).expect(200);
    expect(again.body.refund).toEqual(cancelled.body.refund);

    // Booking recibe available_units = 1 cuando el auto vuelve a estar disponible
    await waitFor(() => received.find((m) => m.item_id === car.vehicle_id && m.available_units === 1 && m.timestamp > reservedPush.timestamp));

    // Feed de eventos (CloudEvents) con X-API-Key
    await http().get('/api/v3/autos/eventos').expect(401);
    const feed = await http().get('/api/v3/autos/eventos').query({ limit: 100 }).set('X-API-Key', TEST_API_KEY).expect(200);
    const mine = feed.body.events.filter((e: { data: { pnr: string } }) => e.data.pnr === pnr);
    expect(mine.map((e: { type: string }) => e.type)).toEqual([
      'ec.edu.epn.booking.autos.order.confirmed', 'ec.edu.epn.booking.autos.order.cancelled',
    ]);
    expect(mine[0]).toMatchObject({ specversion: '1.0', correlation_id: 'cid-test-reserva', data: { auto_id: car.vehicle_id } });
  });

  it('promociones B2B: GET público, PUT con X-API-Key y validación', async () => {
    const before = await http().get('/api/v3/autos/promociones/contrato').expect(200);
    expect(before.body).toMatchObject({ proveedor_codigo: 'NODE_AUT_RUTALIBRE', vertical: 'AUTOS' });

    const agreement = { permite_promociones: true, porcentaje_descuento_maximo: 12.5, destinos_habilitados: ['Quito', 'Guayaquil'] };
    await http().put('/api/v3/autos/promociones/contrato').send(agreement).expect(401);
    await http().put('/api/v3/autos/promociones/contrato').set('X-API-Key', TEST_API_KEY)
      .send({ ...agreement, porcentaje_descuento_maximo: 150 }).expect(400);
    const updated = await http().put('/api/v3/autos/promociones/contrato').set('X-API-Key', TEST_API_KEY).send(agreement).expect(200);
    expect(updated.body).toMatchObject({ success: true, contrato: agreement });

    // Se deja el acuerdo como estaba
    const { permite_promociones, porcentaje_descuento_maximo, destinos_habilitados, vigencia_hasta, condiciones_combo } = before.body;
    await http().put('/api/v3/autos/promociones/contrato').set('X-API-Key', TEST_API_KEY)
      .send({ permite_promociones, porcentaje_descuento_maximo, destinos_habilitados, vigencia_hasta, condiciones_combo }).expect(200);
  });

  it('JSON mal formado → 400 MALFORMED_REQUEST en formato v3', async () => {
    const res = await http().post('/api/v3/reservas').set('X-API-Key', TEST_API_KEY).set('Content-Type', 'application/json')
      .send('{"vehicle_id": ').expect(400);
    expect(res.body).toMatchObject({ code: 'MALFORMED_REQUEST', instance: '/api/v3/reservas' });
  });
});
