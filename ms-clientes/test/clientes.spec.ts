import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createPrivateKey, randomUUID } from 'crypto';
import { SignJWT } from 'jose';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { TEST_API_KEY } from './setup-env';

/** Token de usuario como los de ms-identidad (RS256), firmado con la clave de prueba de setup-env. */
function userToken(role: 'ADMIN' | 'CUSTOMER'): Promise<string> {
  return new SignJWT({ email: `test+${role.toLowerCase()}@rutalibre.test`, role })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer('rutalibre-identidad').setAudience('rutalibre-internal-api').setSubject(randomUUID())
    .setIssuedAt().setExpirationTime('1h')
    .sign(createPrivateKey(process.env.TEST_IDENTITY_PRIVATE_KEY!));
}

/**
 * ms-clientes de punta a punta (con BD): contrato v3.1 con Booking (/api/v3/clientes) y API interna para
 * ms-reservas (/internal/clientes). Requiere haber corrido `npm run db:prepare`.
 */
describe('ms-clientes', () => {
  let app: INestApplication;
  const identifications: string[] = [];
  const newId = () => {
    const id = `09${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
    identifications.push(id);
    return id;
  };

  const http = () => request(app.getHttpServer());
  const booking = { 'X-API-Key': TEST_API_KEY };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.get(DataSource).query(`DELETE FROM clientes.clients WHERE identification = ANY($1)`, [identifications]);
    await app?.close();
  });

  it('contrato v3.1: consulta, alta sin duplicados y errores con el formato v3', async () => {
    const id = newId();
    const email = `cliente.${id}@example.com`;
    await http().get('/api/v3/clientes').query({ email }).expect(401);
    const bad = await http().get('/api/v3/clientes').set(booking).expect(400);
    expect(bad.body).toMatchObject({ status: 400, code: 'MALFORMED_REQUEST', instance: '/api/v3/clientes', correlation_id: expect.any(String) });
    await http().get('/api/v3/clientes').set(booking).query({ email }).expect(404);

    const body = { nombre: 'Lucía Andrade', email, identificacion: id, telefono: '+593987001122', licencia: id };
    const created = await http().post('/api/v3/clientes').set(booking).send(body).expect(201);
    expect(created.body).toMatchObject({ nombre: 'Lucía Andrade', identificacion: id, origen: 'BOOKING', existente: false });
    const clientId: string = created.body.client_id;

    // La misma persona otra vez (cédula con puntos y guion, correo en mayúsculas) → 200 con el mismo client_id
    const again = await http().post('/api/v3/clientes').set(booking)
      .send({ ...body, email: email.toUpperCase(), identificacion: `${id.slice(0, 2)}.${id.slice(2, 8)}-${id.slice(8)}` }).expect(200);
    expect(again.body).toMatchObject({ client_id: clientId, existente: true });
    expect((await http().get('/api/v3/clientes').set(booking).query({ identificacion: id }).expect(200)).body.client_id).toBe(clientId);
    expect((await http().get('/api/v3/clientes').set(booking).query({ email }).expect(200)).body.client_id).toBe(clientId);

    const invalid = await http().post('/api/v3/clientes').set(booking).send({ nombre: 'X', email: 'no-es-correo', identificacion: '1' }).expect(422);
    expect(invalid.body.code).toBe('INVALID_PAYLOAD');
    expect(invalid.body.invalid_params.map((p: { name: string }) => p.name).sort()).toEqual(['email', 'identificacion', 'nombre']);
  });

  it('respeta el X-Correlation-Id entrante (traza desde el gateway o ms-reservas)', async () => {
    const res = await http().get('/api/v3/clientes').set(booking).set('X-Correlation-Id', 'cid-test-cli-1').query({ email: 'nadie@example.com' }).expect(404);
    expect(res.headers['x-correlation-id']).toBe('cid-test-cli-1');
    expect(res.body.correlation_id).toBe('cid-test-cli-1');
  });

  it('el contrato v3.1 solo acepta la X-API-Key de Booking (un token de admin no sirve allí)', async () => {
    await http().get('/api/v3/clientes').set('Authorization', `Bearer ${await userToken('ADMIN')}`).query({ email: 'a@b.ec' }).expect(401);
    await http().get('/api/v3/clientes').set('X-API-Key', 'otra-clave').query({ email: 'a@b.ec' }).expect(401);
  });

  it('API interna: busca o crea con la X-API-Key reenviada por ms-reservas y conserva el origen', async () => {
    const id = newId();
    const body = { nombre: 'Mario Cevallos', email: `mostrador.${id}@example.com`, identificacion: id, origen: 'MOSTRADOR' };
    const created = await http().post('/internal/clientes').set(booking).send(body).expect(201);
    expect(created.body).toMatchObject({ origen: 'MOSTRADOR', existente: false });
    const again = await http().post('/internal/clientes').set(booking).send(body).expect(200);
    expect(again.body.client_id).toBe(created.body.client_id);

    const byId = await http().get(`/internal/clientes/${created.body.client_id}`).set(booking).expect(200);
    expect(byId.body).toMatchObject({ client_id: created.body.client_id, identificacion: id });
    await http().get(`/internal/clientes/${randomUUID()}`).set(booking).expect(404);
    await http().get('/internal/clientes/no-es-uuid').set(booking).expect(404);
  });

  it('API interna: el panel busca por identificación parcial con el token de un ADMIN; cliente → 403; sin nada → 401', async () => {
    const id = newId();
    await http().post('/internal/clientes').set(booking).send({ nombre: 'Rosa Vega', email: `rosa.${id}@example.com`, identificacion: id }).expect(201);

    const admin = { Authorization: `Bearer ${await userToken('ADMIN')}` };
    const found = await http().get('/internal/clientes').set(admin).query({ identificacion: id.slice(2, 8) }).expect(200);
    expect(found.body.map((c: { identificacion: string }) => c.identificacion)).toContain(id);

    await http().get('/internal/clientes').set('Authorization', `Bearer ${await userToken('CUSTOMER')}`).query({ identificacion: id }).expect(403);
    await http().get('/internal/clientes').set('Authorization', 'Bearer abc.def.ghi').query({ identificacion: id }).expect(401);
    await http().get('/internal/clientes').query({ identificacion: id }).expect(401);
  });

  it('/health responde con el estado de la BD y la tabla vive en el schema clientes', async () => {
    const res = await http().get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'ms-clientes', database: 'up' });
    const [{ schema }] = await app.get(DataSource).query(
      `SELECT table_schema AS schema FROM information_schema.tables WHERE table_name = 'clients' AND table_type = 'BASE TABLE'`);
    expect(schema).toBe('clientes');
  });
});
