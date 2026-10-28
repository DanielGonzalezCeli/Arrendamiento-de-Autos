import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { canonicalJson } from '../../src/modules/idempotency/idempotency.service';
import { createApp, futureDate } from '../contract/contract-app';

/** Flujo de venta del marketplace por la API interna (mismos servicios que la API de integración). */
describe('API interna — checkout y mis reservas', () => {
  let app: INestApplication;
  const suffix = Date.now();
  const users = [`test+buyer${suffix}@rutalibre.test`, `test+other${suffix}@rutalibre.test`];
  const tokens: string[] = [];
  const startDay = 30 + Math.floor(Math.random() * 200);

  beforeAll(async () => {
    app = await createApp();
    for (const email of users) {
      const res = await request(app.getHttpServer()).post('/api/auth/register')
        .send({ email, password: 'Prueba2026', firstName: 'Ana', lastName: 'Pérez' }).expect(201);
      tokens.push(res.body.accessToken);
    }
  });

  afterAll(async () => {
    const db = app.get(DataSource);
    const ids = (await db.query(`SELECT id FROM users WHERE email = ANY($1)`, [users])).map((u: { id: string }) => `user:${u.id}`);
    await db.query(`DELETE FROM webhook_deliveries WHERE event_id IN (SELECT e.id FROM outbox_events e JOIN reservations r ON r.id::text = e.resource_id WHERE r.owner_sub = ANY($1))`, [ids]);
    await db.query(`DELETE FROM outbox_events WHERE resource_id IN (SELECT id::text FROM reservations WHERE owner_sub = ANY($1))`, [ids]);
    for (const table of ['reservations', 'order_previews', 'holds', 'idempotency_records']) {
      await db.query(`DELETE FROM ${table} WHERE owner_sub = ANY($1)`, [ids]);
    }
    await db.query(`DELETE FROM users WHERE email = ANY($1)`, [users]);
    await app?.close();
  });

  const http = () => request(app.getHttpServer());
  const as = (i: number) => ({ Authorization: `Bearer ${tokens[i]}` });

  it('búsqueda → hold → preview → confirmación → mis reservas → modificar → cancelar', async () => {
    const search = await http().post('/api/search').send({
      pickupAirport: 'GYE', pickupAt: futureDate(startDay), dropoffAt: futureDate(startDay + 4), driverAge: 30, carTypes: ['SUV'],
    }).expect(200);
    expect(search.body.offers.length).toBeGreaterThan(0);
    const offer = search.body.offers[0];
    expect(offer.vehicle.displayName).toContain('o similar');

    // Sin login no se puede reservar
    await http().post('/api/checkout/hold').send({ searchToken: search.body.searchToken, vehicleId: offer.vehicle.id }).expect(401);

    const hold = await http().post('/api/checkout/hold').set(as(0))
      .send({ searchToken: search.body.searchToken, vehicleId: offer.vehicle.id }).expect(200);
    const preview = await http().post('/api/checkout/preview').set(as(0))
      .send({ searchToken: search.body.searchToken, vehicleId: offer.vehicle.id, holdId: hold.body.holdId, extras: ['CDW'] }).expect(200);
    expect(preview.body.price.total).toBeGreaterThan(offer.price.total);

    const key = randomUUID();
    const driver = { firstName: 'Ana', lastName: 'Pérez', email: 'ana@correo.ec' };

    // Pago rechazado (tarjeta de prueba 0002): 402 y NO se crea la reserva; el hold sigue vigente
    const declined = await http().post('/api/checkout/confirm').set(as(0)).set('Idempotency-Key', randomUUID())
      .send({ orderPreviewId: preview.body.orderPreviewId, driver, paymentToken: 'tok_sim_visa_0002_declined1' }).expect(402);
    expect(declined.body).toMatchObject({ status: 402, code: 'PAYMENT_NOT_AUTHORIZED' });
    expect((await http().get('/api/me/reservations').set(as(0)).expect(200)).body).toHaveLength(0);

    // RN27: más de USD 50 → el SRI no admite consumidor final; hay que identificar al comprador
    const noBilling = await http().post('/api/checkout/confirm').set(as(0)).set('Idempotency-Key', randomUUID())
      .send({ orderPreviewId: preview.body.orderPreviewId, driver, paymentToken: 'tok_sim_visa_4242_nobilling1' }).expect(400);
    expect(noBilling.body.invalidParams).toEqual([expect.objectContaining({ name: 'billing.idType' })]);
    const badCedula = await http().post('/api/checkout/confirm').set(as(0)).set('Idempotency-Key', randomUUID())
      .send({ orderPreviewId: preview.body.orderPreviewId, driver, paymentToken: 'tok_sim_visa_4242_badcedula1', billing: { idType: '05', idNumber: '1710034066', name: 'Ana Pérez' } })
      .expect(400);
    expect(badCedula.body.invalidParams).toEqual([expect.objectContaining({ name: 'billing.idNumber' })]);

    const billing = { idType: '05', idNumber: '1710034065', name: 'Ana Pérez', address: 'Av. Amazonas y Colón, Quito', email: 'ana@correo.ec' };
    const confirmBody = { orderPreviewId: preview.body.orderPreviewId, driver, paymentToken: 'tok_sim_mastercard_4444_approved1', billing };
    const confirmed = await http().post('/api/checkout/confirm').set(as(0)).set('Idempotency-Key', key).send(confirmBody).expect(201);
    expect(confirmed.body).toMatchObject({
      status: 'CONFIRMED', channel: 'WEB', totalPrice: preview.body.price.total, canCancel: true,
      payment: { card: { brand: 'mastercard', last4: '4444' } },
    });
    expect(confirmed.body.payment.reference).toMatch(/^PAY-MASTERCARD-4444-[A-F0-9]{10}$/);

    // Doble clic / reintento: misma respuesta, sin segunda reserva
    const retry = await http().post('/api/checkout/confirm').set(as(0)).set('Idempotency-Key', key).send(confirmBody).expect(201);
    expect(retry.body.id).toBe(confirmed.body.id);

    const mine = await http().get('/api/me/reservations').set(as(0)).expect(200);
    expect(mine.body.map((r: { id: string }) => r.id)).toEqual([confirmed.body.id]);

    // Otro usuario no ve ni cancela la reserva ajena
    await http().get(`/api/me/reservations/${confirmed.body.id}`).set(as(1)).expect(404);
    await http().post(`/api/me/reservations/${confirmed.body.id}/cancel`).set(as(1)).expect(404);

    // Voucher: link firmado público (QR + PDF) sin datos de contacto; con otro token → 404
    expect(confirmed.body.voucherPath).toMatch(new RegExp(`^/voucher/${confirmed.body.locator}\\?t=[\\w-]{22}$`));
    const token = new URL(confirmed.body.voucherPath, 'http://x').searchParams.get('t')!;
    const voucher = await http().get(`/api/vouchers/${confirmed.body.locator}`).query({ t: token }).expect(200);
    expect(voucher.body).toMatchObject({ locator: confirmed.body.locator, status: 'CONFIRMED', driver: { fullName: `${driver.firstName} ${driver.lastName}` } });
    expect(voucher.body.url).toMatch(new RegExp(`/voucher/${confirmed.body.locator}\\?t=${token}$`));
    expect(voucher.body.qrSvg).toMatch(/^<svg/);
    expect(JSON.stringify(voucher.body)).not.toContain(driver.email);
    await http().get(`/api/vouchers/${confirmed.body.locator}`).query({ t: 'A'.repeat(22) }).expect(404);
    await http().get(`/api/vouchers/${confirmed.body.locator}`).expect(404);
    const pdf = await http().get(`/api/vouchers/${confirmed.body.locator}/pdf`).query({ t: token })
      .buffer(true).parse((res, cb) => { const parts: Buffer[] = []; res.on('data', (c: Buffer) => parts.push(c)); res.on('end', () => cb(null, Buffer.concat(parts))); })
      .expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    // Factura emitida en la misma transacción del pago, con el formato del SRI
    const invoicesOf = async () => (await http().get(`/api/me/reservations/${confirmed.body.id}/invoices`).set(as(0)).expect(200)).body as {
      id: string; type: string; number: string; accessKey: string; total: number; buyer: { id: string; name: string };
    }[];
    const [invoice] = await invoicesOf();
    expect(invoice).toMatchObject({ type: 'INVOICE', total: confirmed.body.totalPrice, buyer: { id: '1710034065', name: 'ANA PÉREZ' } });
    expect(invoice.number).toMatch(/^001-001-\d{9}$/);
    expect(invoice.accessKey).toMatch(/^\d{49}$/);
    const asBuffer = (req: request.Test) => req.buffer(true)
      .parse((res, cb) => { const parts: Buffer[] = []; res.on('data', (c: Buffer) => parts.push(c)); res.on('end', () => cb(null, Buffer.concat(parts))); });
    const ride = await asBuffer(http().get(`/api/me/invoices/${invoice.id}/pdf`).set(as(0))).expect(200);
    expect((ride.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    const xml = (await asBuffer(http().get(`/api/me/invoices/${invoice.id}/xml`).set(as(0))).expect(200)).body.toString();
    expect(xml).toContain(`<claveAcceso>${invoice.accessKey}</claveAcceso>`);
    expect(xml).toContain(`<importeTotal>${confirmed.body.totalPrice.toFixed(2)}</importeTotal>`);
    expect(xml).toContain('<identificacionComprador>1710034065</identificacionComprador>');
    await http().get(`/api/me/invoices/${invoice.id}/pdf`).set(as(1)).expect(404);
    await http().get(`/api/me/reservations/${confirmed.body.id}/invoices`).set(as(1)).expect(404);

    const modified = await http().post(`/api/me/reservations/${confirmed.body.id}/modify`).set(as(0))
      .send({ extrasToRemove: ['CDW'], extrasToAdd: ['GPS'] }).expect(200);
    expect(modified.body.extras.map((e: { code: string }) => e.code)).toEqual(['GPS']);

    const cancelled = await http().post(`/api/me/reservations/${confirmed.body.id}/cancel`).set(as(0)).expect(200);
    expect(cancelled.body).toMatchObject({ status: 'CANCELLED', canCancel: false, cancellationFee: 0 });

    // Modificación (CDW → GPS, más barato) = nota de crédito por la diferencia; cancelación sin penalización = nota de
    // crédito por el resto. Lo facturado neto queda en cero.
    const docs = await invoicesOf();
    expect(docs.map((d) => d.type)).toEqual(['INVOICE', 'CREDIT_NOTE', 'CREDIT_NOTE']);
    const net = docs.reduce((sum, d) => sum + Math.round(d.total * 100) * (d.type === 'INVOICE' ? 1 : -1), 0);
    expect(net).toBe(0);
    expect(docs[1].total).toBeCloseTo(confirmed.body.totalPrice - modified.body.totalPrice, 2);
  });

  it('el backend nunca acepta el número de tarjeta: solo el token de la pasarela', async () => {
    const res = await http().post('/api/checkout/confirm').set(as(0)).set('Idempotency-Key', randomUUID())
      .send({ orderPreviewId: randomUUID(), driver: { firstName: 'Ana', lastName: 'Pérez', email: 'ana@correo.ec' }, paymentToken: '4242424242424242' });
    expect(res.status).toBe(400);
    expect(res.body.invalidParams).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'paymentToken' })]));
  });

  it('los datos del conductor son obligatorios', async () => {
    const res = await http().post('/api/checkout/confirm').set(as(0)).set('Idempotency-Key', randomUUID())
      .send({ orderPreviewId: randomUUID(), driver: { firstName: '', lastName: '', email: 'no-es-correo' } });
    expect(res.status).toBe(400);
  });
});

describe('canonicalJson (huella de idempotencia)', () => {
  it('el orden de las propiedades no cambia la huella', () => {
    expect(canonicalJson({ b: 1, a: { d: [1, 2], c: 'x' } })).toBe(canonicalJson({ a: { c: 'x', d: [1, 2] }, b: 1 }));
  });

  it('valores distintos → huella distinta', () => {
    expect(canonicalJson({ a: 1 })).not.toBe(canonicalJson({ a: 2 }));
  });
});
