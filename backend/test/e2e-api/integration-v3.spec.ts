import { FAKE_BOOKING_HTTP_PORT, FAKE_CLIENTS_PORT, FAKE_INVENTORY_PORT, TEST_API_KEY } from './v3-env';
import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { createServer, IncomingHttpHeaders, Server } from 'http';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/domain/enums';
import { createApp } from '../contract/contract-app';
import { testUser } from '../identity-tokens';
import { MessageBus } from '../../src/modules/messaging/message-bus';
import { VehicleStock } from '../../src/modules/fleet-events/fleet-stock';

/** Fecha local "YYYY-MM-DD" dentro de `days` días. */
function day(days: number): string {
  return new Date(Date.now() + days * 24 * 3600_000).toISOString().slice(0, 10);
}

const inventoryCalls: IncomingHttpHeaders[] = [];
const inventoryDown = { value: false };

/** ms-inventario simulado: responde /internal/stock como el real (estado del envío de stock a Booking). */
function startFakeInventory(): Promise<Server> {
  const server = createServer((req, res) => {
    inventoryCalls.push(req.headers);
    if (inventoryDown.value || req.url !== '/internal/stock') return res.writeHead(503).end();
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({
      mode: 'http', target: 'https://booking.test/api/v3/inventory/stock', active: true,
      sync: { tracked: 3, ok: 3, failing: 0, lastSyncedAt: new Date().toISOString() },
      pushes: [{ id: '1', itemId: 'auto-pan-1001', transport: 'http', success: true, errorCode: 'OK', availableUnits: '1', date: '2026-11-11', timeSlot: '10:00' }],
      broker: { connected: true, exchange: 'rutalibre.eventos', queue: 'ms-inventario.flota', processed: 7 },
    }));
  });
  return new Promise((ok) => server.listen(FAKE_INVENTORY_PORT, '127.0.0.1', () => ok(server)));
}

interface CheckinCall {
  url: string;
  headers: IncomingHttpHeaders;
  body: Record<string, unknown>;
}

/** Booking por HTTP: recibe POST /api/v3/reservas/{id}/checkin y responde como el Booking real. */
async function startFakeBookingHttp(calls: CheckinCall[]): Promise<Server> {
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      calls.push({ url: req.url ?? '', headers: req.headers, body: JSON.parse(raw || '{}') });
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ acknowledged: true, status: 'CONFIRMADO_ASISTIDO' }));
    });
  });
  await new Promise<void>((ok) => server.listen(FAKE_BOOKING_HTTP_PORT, '127.0.0.1', ok));
  return server;
}

interface FakeClient {
  client_id: string;
  nombre: string;
  email: string;
  identificacion: string;
  licencia: string | null;
  origen: string;
}

/**
 * ms-clientes simulado: la API interna que usa ms-reservas (buscar o crear, por id y búsqueda parcial). Guarda las
 * cabeceras recibidas para comprobar que se reenvían la credencial y el X-Correlation-Id. status ≠ 200 simula una falla.
 */
function startFakeClients(store: Map<string, FakeClient>, calls: { method: string; url: string; headers: IncomingHttpHeaders }[], fail: { status: number }) {
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      calls.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers });
      const send = (status: number, body: unknown) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
      if (fail.status !== 200) return send(fail.status, {});
      const url = new URL(req.url ?? '/', 'http://x');
      if (req.method === 'POST' && url.pathname === '/internal/clientes') {
        const body = JSON.parse(raw);
        const existing = [...store.values()].find((c) => c.identificacion === body.identificacion);
        if (existing) return send(200, { ...existing, existente: true });
        const client = { client_id: randomUUID(), nombre: body.nombre, email: body.email, identificacion: body.identificacion, licencia: body.licencia, origen: body.origen };
        store.set(client.client_id, client);
        return send(201, { ...client, existente: false });
      }
      if (req.method === 'GET' && url.pathname === '/internal/clientes') {
        const term = url.searchParams.get('identificacion') ?? '';
        return send(200, [...store.values()].filter((c) => c.identificacion.includes(term)));
      }
      const byId = store.get(url.pathname.split('/').pop() ?? '');
      return byId ? send(200, byId) : send(404, {});
    });
  });
  return new Promise<Server>((ok) => server.listen(FAKE_CLIENTS_PORT, '127.0.0.1', () => ok(server)));
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

describe('Contrato v3 con Booking Prototipo (/api/v3) + eventos de flota (RabbitMQ)', () => {
  let app: INestApplication;
  let inventoryServer: Server;
  let httpServer: Server;
  let clientsServer: Server;
  const clientStore = new Map<string, FakeClient>();
  const clientCalls: { method: string; url: string; headers: IncomingHttpHeaders }[] = [];
  const clientsFail = { status: 200 };
  const checkins: CheckinCall[] = [];
  const pnrs: string[] = [];
  const keys: string[] = [];
  const startDay = 40 + Math.floor(Math.random() * 200);
  const identifications: string[] = ['1710034065'];

  beforeAll(async () => {
    inventoryServer = await startFakeInventory();
    httpServer = await startFakeBookingHttp(checkins);
    clientsServer = await startFakeClients(clientStore, clientCalls, clientsFail);
    app = await createApp();
  });

  afterAll(async () => {
    const db = app.get(DataSource);
    const ids = (await db.query(`SELECT id::text FROM reservations WHERE locator = ANY($1)`, [pnrs])).map((r: { id: string }) => r.id);
    await db.query(`DELETE FROM webhook_deliveries WHERE event_id IN (SELECT id FROM outbox_events WHERE resource_id = ANY($1))`, [ids]);
    await db.query(`DELETE FROM outbox_events WHERE resource_id = ANY($1)`, [ids]);
    await db.query(`DELETE FROM reservations WHERE locator = ANY($1)`, [pnrs]);
    await db.query(`DELETE FROM idempotency_records WHERE idempotency_key = ANY($1)`, [keys]);
    await app?.close();
    await new Promise((ok) => inventoryServer?.close(ok));
    await new Promise((ok) => clientsServer?.close(ok));
    httpServer?.close();
  });

  const http = () => request(app.getHttpServer());
  const events = () => app.get(MessageBus).published;
  const vehiclesOf = (e: { event: { data: unknown } }) => (e.event.data as { vehicles: VehicleStock[] }).vehicles;
  const key = () => {
    const k = randomUUID();
    keys.push(k);
    return k;
  };
  const driver = { full_name: 'Carlos Andrés Zambrano', email: 'carlos.zambrano@example.com', phone: '+593987654321', license_number: '1710034065', age: 30 };

  it('semáforo: GET /health y /autos/health responden HEALTHY sin credenciales', async () => {
    for (const path of ['/api/v3/health', '/api/v3/autos/health']) {
      const res = await http().get(path).expect(200);
      expect(res.body).toMatchObject({ status: 'HEALTHY', nodo_id: 'NODE_AUT_RUTALIBRE', vertical: 'AUTOS', sincronizacion_stock: 'eventos-memoria' });
      expect(res.headers['x-correlation-id']).toMatch(/^cid-aut-/);
    }
  });

  it('al arrancar publica el estado de toda la flota (flota.snapshot, CloudEvents)', async () => {
    const snapshot = await waitFor(() => events().find((e) => e.routingKey === 'flota.snapshot'));
    expect(snapshot.event).toMatchObject({ specversion: '1.0', type: 'ec.rutalibre.flota.snapshot', source: 'ms-reservas', correlationid: expect.stringMatching(/^cid-aut-/) });
    const [first] = vehiclesOf(snapshot);
    expect(first.vehicle_id).toMatch(/^auto-[a-z]{3}-\d{3,4}$/);
    expect(first.time_slot).toMatch(/^\d{2}:(00|30)$/);
    expect([0, 1]).toContain(first.available_units);
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

    // Evento flota.estado_cambiado: 0 unidades en la fecha y hora de retiro (ms-inventario lo envía a Booking). El retiro es
    // lejano, así que hoy el auto sigue DISPONIBLE
    const reservedEvent = await waitFor(() => events().find((e) => e.routingKey === 'flota.estado_cambiado' && vehiclesOf(e)[0].vehicle_id === car.vehicle_id));
    expect(vehiclesOf(reservedEvent)[0]).toEqual({ vehicle_id: car.vehicle_id, state: 'DISPONIBLE', available_units: 0, date: day(startDay), time_slot: '10:00' });
    // Trazabilidad: el evento viaja con el X-Correlation-Id de la reserva que lo causó
    expect(reservedEvent.event.correlationid).toBe('cid-test-reserva');

    // POST /autos/search (guía de socios): con fechas que se cruzan el auto no aparece; en otras fechas sí, con stock 1
    const search = (extra: Record<string, unknown>) => http().post('/api/v3/autos/search').send({ ciudad: car.ubicacion.ciudad, ...extra });
    const overlapping = await search({ fecha_inicio: day(startDay + 1), fecha_fin: day(startDay + 2) }).expect(200);
    expect(overlapping.body.data.map((a: { vehicle_id: string }) => a.vehicle_id)).not.toContain(car.vehicle_id);
    const later = await search({ fecha_inicio: day(startDay + 10), fecha_fin: day(startDay + 12), categoria: car.categoria }).expect(200);
    expect(later.body.data.find((a: { vehicle_id: string }) => a.vehicle_id === car.vehicle_id)).toMatchObject({ stock: 1, categoria: car.categoria });
    expect(later.body.data.every((a: { ubicacion: { ciudad: string } }) => a.ubicacion.ciudad === car.ubicacion.ciudad)).toBe(true);
    expect((await search({ ciudad: 'Ciudad Inexistente' }).expect(200)).body.total).toBe(0);
    await search({ fecha_inicio: day(startDay + 3), fecha_fin: day(startDay) }).expect(422)
      .expect((res) => expect(res.body.code).toBe('INVALID_DATES'));
    await search({ categoria: 'NAVE' }).expect(400);

    // Reintento con la misma clave → misma respuesta, sin segunda reserva
    const replay = await http().post('/api/v3/autos/reservas').set('X-API-Key', TEST_API_KEY).set('Idempotency-Key', idem).send(body).expect(201);
    expect(replay.body.pnr).toBe(pnr);
    expect(replay.headers['idempotent-replayed']).toBe('true');

    // Misma clave con otro cuerpo → 400 IDEMPOTENCY_CONFLICT (no 409: no debe disparar la Saga)
    await http().post('/api/v3/reservas').set('X-API-Key', TEST_API_KEY).set('Idempotency-Key', idem)
      .send({ ...body, coverage_type: 'BASIC' }).expect(400)
      .expect((res) => expect(res.body.code).toBe('IDEMPOTENCY_CONFLICT'));

    // El mismo auto en fechas que se cruzan → 409 VEHICLE_UNAVAILABLE (dispara la compensación de la Saga)
    const conflict = await http().post('/api/v3/autos/orders').set('X-API-Key', TEST_API_KEY).set('Idempotency-Key', key())
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
    expect(vehicle.body.estado).toBe('DISPONIBLE');

    // Una reserva futura no oculta el auto para otras fechas: sigue en el catálogo y en la búsqueda de un periodo
    // anterior; solo desaparece de la búsqueda que se cruza con la reserva
    const synced = await http().get('/api/v3/autos').query({ limit: 100 }).expect(200);
    expect(synced.body.data.map((a: { vehicle_id: string }) => a.vehicle_id)).toContain(car.vehicle_id);
    const idsFor = async (from: number, to: number) => (await http().post('/api/v3/autos/search')
      .send({ fecha_inicio: day(from), fecha_fin: day(to) }).expect(200)).body.data.map((a: { vehicle_id: string }) => a.vehicle_id);
    expect(await idsFor(startDay - 10, startDay - 7)).toContain(car.vehicle_id);
    expect(await idsFor(startDay + 1, startDay + 2)).not.toContain(car.vehicle_id);

    // Compensación de la Saga → 200, reembolso del 100 %, auto liberado; un reintento devuelve lo mismo
    const cancelled = await http().post(`/api/v3/orders/${pnr}/cancel`).set('X-API-Key', TEST_API_KEY)
      .send({ motivo: 'Fallo en el vuelo', solicitante: 'SAGA_ORCHESTRATOR' }).expect(200);
    expect(cancelled.body).toMatchObject({
      pnr, status: 'CANCELLED', auto_id: car.vehicle_id,
      refund: {
        refund_id: `REF-AUTO-${pnr.slice(3)}`, amount: created.body.total_price.total, currency: 'USD', percentage: 100, status: 'PROCESSED',
        message: 'Reembolso total de renta procesado sin penalización (Saga Pattern).',
      },
      inventory_restoration: {
        status: 'RESTORED', vehicle_id: car.vehicle_id, new_state: 'DISPONIBLE', message: 'Vehículo reincorporado a flota disponible para renta.',
      },
      message: 'Orden de renta cancelada exitosamente. Vehículo liberado y reembolso procesado.',
    });
    const again = await http().post(`/api/v3/reservas/${pnr}/cancel`).set('X-API-Key', TEST_API_KEY).expect(200);
    expect(again.body.refund).toEqual(cancelled.body.refund);

    // Al cancelar, otro evento: el auto vuelve a estar disponible (1 unidad)
    await waitFor(() => events().slice(events().indexOf(reservedEvent) + 1)
      .find((e) => e.routingKey === 'flota.estado_cambiado' && vehiclesOf(e)[0].vehicle_id === car.vehicle_id && vehiclesOf(e)[0].available_units === 1));

    // Feed de eventos (CloudEvents) con X-API-Key
    await http().get('/api/v3/autos/eventos').expect(401);
    const feed = await http().get('/api/v3/autos/eventos').query({ limit: 100 }).set('X-API-Key', TEST_API_KEY).expect(200);
    const mine = feed.body.events.filter((e: { data: { pnr: string } }) => e.data.pnr === pnr);
    expect(mine.map((e: { type: string }) => e.type)).toEqual([
      'ec.edu.epn.booking.autos.order.confirmed', 'ec.edu.epn.booking.autos.order.cancelled',
    ]);
    expect(mine[0]).toMatchObject({ specversion: '1.0', correlation_id: 'cid-test-reserva', data: { auto_id: car.vehicle_id } });
  });

  it('clientes v3.1 (ms-clientes): la reserva de Booking se vincula a su cliente con la X-API-Key y el cid reenviados', async () => {
    const id = `09${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
    identifications.push(id);
    const email = `cliente.${id}@example.com`;
    const auth = (r: request.Test) => r.set('X-API-Key', TEST_API_KEY);
    // /api/v3/clientes ya no lo atiende ms-reservas (el gateway lo enruta a ms-clientes)
    await auth(http().get('/api/v3/clientes').query({ email })).expect(404);

    // Booking registró antes al cliente en ms-clientes y reserva con su client_id → la reserva queda vinculada
    const known: FakeClient = { client_id: randomUUID(), nombre: 'Lucía Paredes', email, identificacion: id, licencia: id, origen: 'BOOKING' };
    clientStore.set(known.client_id, known);
    const catalog = await http().get('/api/v3/autos').query({ limit: 100 }).expect(200);
    const car = catalog.body.data[catalog.body.data.length - 1];
    const order = {
      vehicle_id: car.vehicle_id, client_id: known.client_id, pickup_date: day(startDay + 30), dropoff_date: day(startDay + 31),
      pickup_time: '10:00:00', dropoff_time: '12:00:00', coverage_type: 'BASIC',
      driver: { full_name: 'Lucía Paredes', email, phone: '+593987001122', license_number: id, age: 31 },
    };
    clientCalls.length = 0;
    const reserved = await auth(http().post('/api/v3/autos/orders')).set('Idempotency-Key', key()).set('X-Correlation-Id', 'cid-v3-clientes-1')
      .send(order).expect(201);
    pnrs.push(reserved.body.pnr);
    expect(reserved.body.client_id).toBe(known.client_id);
    expect(clientCalls[0]).toMatchObject({ method: 'GET', url: `/internal/clientes/${known.client_id}` });
    expect(clientCalls[0].headers).toMatchObject({ 'x-api-key': TEST_API_KEY, 'x-correlation-id': 'cid-v3-clientes-1' });

    // Sin client_id se busca o registra por la licencia: mismo cliente, sin duplicarlo
    const second = await auth(http().post('/api/v3/autos/orders')).set('Idempotency-Key', key())
      .send({ ...order, client_id: undefined, pickup_date: day(startDay + 40), dropoff_date: day(startDay + 41) }).expect(201);
    pnrs.push(second.body.pnr);
    expect(second.body.client_id).toBe(known.client_id);
    expect([...clientStore.values()].filter((c) => c.identificacion === id)).toHaveLength(1);

    // Si ms-clientes falla, la reserva se crea igual (sin vínculo): la Saga de Booking no depende de ms-clientes
    clientsFail.status = 500;
    try {
      const third = await auth(http().post('/api/v3/autos/orders')).set('Idempotency-Key', key())
        .send({ ...order, client_id: undefined, pickup_date: day(startDay + 45), dropoff_date: day(startDay + 46) }).expect(201);
      pnrs.push(third.body.pnr);
      expect(third.body.client_id).toBeNull();
    } finally {
      clientsFail.status = 200;
    }
  });

  it('mostrador v3.1: buscar por cédula, confirmar la entrega y avisar el check-in a Booking (outbox)', async () => {
    const id = `08${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
    identifications.push(id);
    const email = `mostrador.${id}@example.com`;
    const catalog = await http().get('/api/v3/autos').query({ limit: 100 }).expect(200);
    const car = catalog.body.data[Math.floor(catalog.body.data.length / 2)];
    const order = await http().post('/api/v3/autos/orders').set('X-API-Key', TEST_API_KEY).set('Idempotency-Key', key()).send({
      vehicle_id: car.vehicle_id, pickup_date: day(startDay + 50), dropoff_date: day(startDay + 52), coverage_type: 'BASIC',
      driver: { full_name: 'Mario Cevallos', email, phone: '+593987003344', license_number: id, age: 40 },
    }).expect(201);
    const pnr: string = order.body.pnr;
    pnrs.push(pnr);

    const admin = (await testUser(UserRole.Admin)).headers;
    const found = await http().get('/api/admin/reservations').query({ q: id }).set(admin).expect(200);
    expect(found.body).toHaveLength(1);
    expect(found.body[0]).toMatchObject({ locator: pnr, rentalStatus: 'NOT_STARTED', fromBooking: true, identification: id });

    const delivered = await http().post(`/api/admin/reservations/${found.body[0].id}/pickup`).set(admin)
      .send({ fuelEighths: 8, notes: 'Contrato firmado y licencia validada' }).expect(200);
    expect(delivered.body).toMatchObject({ rentalStatus: 'PICKED_UP', fromBooking: true, client: { identification: id } });
    expect(delivered.body.bookingCheckin).toMatchObject({ status: 'SENT', acknowledgedStatus: 'CONFIRMADO_ASISTIDO', attempts: 1 });

    const call = checkins.find((c) => c.url === `/api/v3/reservas/${pnr}/checkin`)!;
    expect(call.headers['x-api-key']).toBe(TEST_API_KEY);
    expect(call.headers['x-correlation-id']).toMatch(/^cid-aut-/);
    expect(call.body).toMatchObject({
      external_order_id: pnr, client_id: order.body.client_id, estado: 'CONFIRMADO_ASISTIDO',
      observaciones: 'Contrato firmado y licencia validada',
    });
    expect(new Date(call.body.fecha_checkin as string).getTime()).toBeGreaterThan(Date.now() - 60_000);

    // Auto ya retirado en mostrador → la Saga no puede cancelar (409) y la orden sigue activa
    const late = await http().post(`/api/v3/autos/orders/${pnr}/cancel`).set('X-API-Key', TEST_API_KEY)
      .send({ motivo: 'Fallo en el vuelo' }).expect(409);
    expect(late.body).toMatchObject({ status: 409, title: 'Cancelación no permitida', detail: 'El alquiler ya comenzó; no se puede cancelar' });
    const still = await http().get(`/api/v3/autos/orders/${pnr}`).set('X-API-Key', TEST_API_KEY).expect(200);
    expect(still.body.status).toBe('CONFIRMED');
  });

  it('panel: /api/admin/booking muestra configuración, flota, stock enviado y reservas de Booking (sin la clave)', async () => {
    await http().get('/api/admin/booking').expect(401);
    const admin = (await testUser(UserRole.Admin)).headers;

    const res = await http().get('/api/admin/booking').set(admin).set('X-Correlation-Id', 'cid-panel-1').expect(200);
    expect(res.body.config).toMatchObject({
      nodeId: 'NODE_AUT_RUTALIBRE', stockMode: 'http', stockClientActive: true, apiKeyConfigured: true, inventoryReachable: true,
      eventBus: { mode: 'memoria', connected: true, consumerConnected: true },
    });
    // El panel le pide el estado del envío a ms-inventario con el token del admin y el mismo correlation id
    expect(inventoryCalls[0]).toMatchObject({ authorization: admin.Authorization, 'x-correlation-id': 'cid-panel-1' });
    expect(JSON.stringify(res.body)).not.toContain(TEST_API_KEY);
    const states = Object.values(res.body.fleet.states as Record<string, number>).reduce((a, b) => a + b, 0);
    expect(states).toBe(res.body.fleet.total);
    expect(res.body.sync.ok).toBe(3);
    expect(res.body.pushes[0]).toMatchObject({ transport: 'http', success: true });
    expect(res.body.orders.map((o: { locator: string }) => o.locator)).toEqual(expect.arrayContaining(pnrs));

    // "Sincronizar ahora" publica un snapshot de toda la flota
    const before = events().filter((e) => e.routingKey === 'flota.snapshot').length;
    const sync = await http().post('/api/admin/booking/sync').set(admin).expect(200);
    expect(sync.body).toEqual({ checked: res.body.fleet.total, published: true });
    expect(events().filter((e) => e.routingKey === 'flota.snapshot')).toHaveLength(before + 1);

    // Si ms-inventario no responde, el panel sale igual (sin el detalle del envío)
    inventoryDown.value = true;
    try {
      const degraded = await http().get('/api/admin/booking').set(admin).expect(200);
      expect(degraded.body.config).toMatchObject({ inventoryReachable: false, stockMode: 'desconocido' });
      expect(degraded.body.pushes).toEqual([]);
    } finally {
      inventoryDown.value = false;
    }
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
