import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { createServer, IncomingHttpHeaders, Server } from 'http';
import { createLocalJWKSet, jwtVerify, SignJWT } from 'jose';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { FAKE_RESERVAS_PORT } from './setup-env';

/**
 * ms-identidad de punta a punta (con BD): registro, login, JWKS y gestión de usuarios. ms-reservas se reemplaza
 * por un servidor HTTP falso que responde el historial de usuarios, para probar la llamada entre servicios.
 * Requiere haber corrido `npm run db:prepare` (migraciones + usuarios de demostración).
 */
describe('ms-identidad', () => {
  let app: INestApplication;
  let reservas: Server;
  let reservasUsage: { userId: string; reservations: number; reviews: number; blocks: number }[] = [];
  let reservasStatus = 200;
  const reservasCalls: IncomingHttpHeaders[] = [];
  let adminToken: string;

  // Prefijo propio de esta corrida: la limpieza no toca usuarios de otras corridas.
  const runPrefix = `test+idn${Date.now()}`;
  const email = `${runPrefix}@rutalibre.test`;
  const password = 'Prueba2026';
  // Usuario de Gmail único por corrida: solo letras (las reglas de Google exigen al menos una letra)
  const gmailUser = `rutalibreidn${Date.now().toString(36).replace(/\d/g, '')}`;

  // Cada test llega desde una IP distinta (como la pone el gateway): el límite de 10 logins/min es por IP.
  let clientIp = 0;
  const http = () => request.agent(app.getHttpServer()).set('X-Forwarded-For', `10.0.0.${clientIp}`);
  const admin = () => ({ Authorization: `Bearer ${adminToken}` });
  const db = () => app.get(DataSource);

  beforeAll(async () => {
    reservas = createServer((req, res) => {
      reservasCalls.push(req.headers);
      if (req.url !== '/api/admin/user-usage') return res.writeHead(404).end();
      res.writeHead(reservasStatus, { 'Content-Type': 'application/json' }).end(JSON.stringify(reservasUsage));
    });
    await new Promise<void>((resolve) => reservas.listen(FAKE_RESERVAS_PORT, '127.0.0.1', resolve));

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    const login = await http().post('/api/auth/login').send({ email: 'admin@rutalibre.ec', password: 'Admin12345!' }).expect(200);
    adminToken = login.body.accessToken;
  });

  afterAll(async () => {
    await db().query(`DELETE FROM identidad.users WHERE email LIKE $1`, [`${runPrefix}%`]);
    await db().query(`DELETE FROM identidad.users WHERE email_canonical = $1`, [`${gmailUser}@gmail.com`]);
    await app?.close();
    await new Promise((resolve) => reservas.close(resolve));
  });

  beforeEach(() => {
    clientIp++;
    reservasUsage = [];
    reservasStatus = 200;
  });

  // ── Registro y login ──────────────────────────────────────────────────────
  it('POST /api/auth/register crea un CLIENTE y devuelve token (sin passwordHash)', async () => {
    const res = await http().post('/api/auth/register')
      .send({ email, password, firstName: 'Ana', lastName: 'Pérez', role: 'ADMIN' }) // role se ignora (RN27)
      .expect(201);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ email, role: 'CUSTOMER' });
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('registrar el mismo correo → 409 ProblemDetails', async () => {
    const res = await http().post('/api/auth/register')
      .send({ email: email.toUpperCase(), password, firstName: 'Ana', lastName: 'Pérez' }).expect(409);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ status: 409, code: 'VALIDATION_FAILED' });
  });

  it('body inválido → 400 con invalidParams y el mismo formato de error que ms-reservas', async () => {
    const res = await http().post('/api/auth/register').send({ email: 'no-es-correo', password: '123' }).expect(400);
    const names = res.body.invalidParams.map((p: { name: string }) => p.name);
    expect(names).toEqual(expect.arrayContaining(['email', 'password', 'firstName', 'lastName']));
    expect(Object.keys(res.body).sort()).toEqual(['code', 'detail', 'invalidParams', 'status', 'title', 'type']);
  });

  it('rechaza nombres con números, correos sin dominio y teléfonos inválidos para su país', async () => {
    const res = await http().post('/api/auth/register')
      .send({ email: 'ana@correo', password, firstName: 'Ana2', lastName: 'P3rez', phone: '+59399123' }).expect(400);
    expect(res.body.invalidParams.map((p: { name: string }) => p.name).sort()).toEqual(['email', 'firstName', 'lastName', 'phone']);
  });

  it('aplica las reglas de Gmail y no permite dos cuentas para el mismo buzón', async () => {
    await http().post('/api/auth/register').send({ email: `${gmailUser}@gmail.com`, password, firstName: 'Ana', lastName: 'Pérez' }).expect(201);
    const dotted = `${gmailUser.slice(0, 3)}.${gmailUser.slice(3)}@gmail.com`;
    const dup = await http().post('/api/auth/register').send({ email: dotted, password, firstName: 'Ana', lastName: 'Pérez' }).expect(409);
    expect(dup.body.detail).toMatch(/los puntos/);
    await http().post('/api/auth/login').send({ email: dotted, password }).expect(200);
  });

  it('una cuenta migrada del monolito (hash bcrypt existente) sigue iniciando sesión', async () => {
    const legacy = `${runPrefix}legacy@rutalibre.test`;
    await db().query(
      `INSERT INTO identidad.users (email, email_canonical, password_hash, first_name, last_name) VALUES ($1, $2, $3, 'Ana', 'Pérez')`,
      [legacy, legacy, await bcrypt.hash(password, 4)]);
    await http().post('/api/auth/login').send({ email: legacy, password }).expect(200);
  });

  it('acepta un turista con teléfono de otro país y lo guarda en formato internacional', async () => {
    const res = await http().post('/api/auth/register').send({
      email: `${runPrefix}tourist@rutalibre.test`, password, firstName: 'John', lastName: "O'Brien", phone: '+1 202 555 0143',
    }).expect(201);
    expect(res.body.user.phone).toBe('+12025550143');
  });

  it('login correcto → token que sirve para /api/auth/me', async () => {
    const login = await http().post('/api/auth/login').send({ email, password }).expect(200);
    const me = await http().get('/api/auth/me').set('Authorization', `Bearer ${login.body.accessToken}`).expect(200);
    expect(me.body).toMatchObject({ email, firstName: 'Ana', role: 'CUSTOMER' });
  });

  it('login con contraseña incorrecta o correo inexistente → mismo 401', async () => {
    const wrong = await http().post('/api/auth/login').send({ email, password: 'Otra2026x' }).expect(401);
    const unknown = await http().post('/api/auth/login').send({ email: 'nadie@rutalibre.test', password }).expect(401);
    expect(wrong.body.detail).toBe(unknown.body.detail);
  });

  it('más de 10 intentos de login por minuto desde la misma IP → 429; otra IP sigue pudiendo entrar', async () => {
    for (let i = 0; i < 10; i++) await http().post('/api/auth/login').send({ email, password: 'Otra2026x' }).expect(401);
    const blocked = await http().post('/api/auth/login').send({ email, password }).expect(429);
    expect(blocked.body).toMatchObject({ status: 429, code: 'RATE_LIMIT_EXCEEDED' });
    clientIp++;
    await http().post('/api/auth/login').send({ email, password }).expect(200);
  });

  // ── Tokens y JWKS ─────────────────────────────────────────────────────────
  it('el token es RS256 y se verifica con la clave pública de /.well-known/jwks.json (sin la parte privada)', async () => {
    const jwks = await http().get('/.well-known/jwks.json').expect(200);
    expect(jwks.headers['cache-control']).toContain('max-age');
    expect(jwks.body.keys).toHaveLength(1);
    expect(jwks.body.keys[0]).toMatchObject({ kty: 'RSA', alg: 'RS256', use: 'sig', kid: expect.any(String) });
    expect(jwks.body.keys[0].d).toBeUndefined();

    const { protectedHeader, payload } = await jwtVerify(adminToken, createLocalJWKSet(jwks.body), {
      issuer: 'rutalibre-identidad', audience: 'rutalibre-internal-api',
    });
    expect(protectedHeader).toMatchObject({ alg: 'RS256', kid: jwks.body.keys[0].kid });
    expect(payload).toMatchObject({ email: 'admin@rutalibre.ec', role: 'ADMIN', sub: expect.any(String) });
  });

  it('sin token, token alterado o firmado con otro secreto (HS256) → 401', async () => {
    await http().get('/api/auth/me').expect(401);
    const res = await http().get('/api/auth/me').set('Authorization', 'Bearer abc.def.ghi').expect(401);
    expect(res.body).toMatchObject({ status: 401, code: 'VALIDATION_FAILED' });

    const [, body] = adminToken.split('.');
    const forged = await new SignJWT(JSON.parse(Buffer.from(body, 'base64url').toString()))
      .setProtectedHeader({ alg: 'HS256' }).sign(new TextEncoder().encode('un-secreto-cualquiera-de-32-caracteres'));
    await http().get('/api/auth/me').set('Authorization', `Bearer ${forged}`).expect(401);
  });

  // ── Panel: gestión de usuarios ───────────────────────────────────────────
  it('solo ADMIN: sin token → 401; cliente → 403', async () => {
    await http().get('/api/admin/users').expect(401);
    const login = await http().post('/api/auth/login').send({ email, password }).expect(200);
    await http().get('/api/admin/users').set('Authorization', `Bearer ${login.body.accessToken}`).expect(403);
  });

  it('lista con las reservas de cada usuario, pedidas a ms-reservas con el token del admin y el correlation id', async () => {
    const me = await http().get('/api/auth/me').set(admin()).expect(200);
    reservasUsage = [{ userId: me.body.id, reservations: 7, reviews: 0, blocks: 0 }];
    reservasCalls.length = 0;
    const res = await http().get('/api/admin/users').set(admin()).set('X-Correlation-Id', 'cid-test-idn-1').expect(200);
    expect(res.body.find((u: { id: string }) => u.id === me.body.id)).toMatchObject({ email: 'admin@rutalibre.ec', reservations: 7, active: true });
    expect(res.body.find((u: { email: string }) => u.email === email)).toMatchObject({ reservations: 0 });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|emailCanonical/);
    expect(reservasCalls[0]).toMatchObject({ authorization: `Bearer ${adminToken}`, 'x-correlation-id': 'cid-test-idn-1' });
  });

  it('si ms-reservas no responde, la lista sale igual (reservas = null) pero no se elimina nadie (503)', async () => {
    reservasStatus = 500;
    const res = await http().get('/api/admin/users').set(admin()).expect(200);
    expect(res.body[0].reservations).toBeNull();
    const target = res.body.find((u: { email: string }) => u.email === email);
    const del = await http().delete(`/api/admin/users/${target.id}`).set(admin()).expect(503);
    expect(del.body.detail).toMatch(/ms-reservas/);
  });

  it('el admin crea, edita, restablece la contraseña y elimina una cuenta sin historial', async () => {
    const managed = `${runPrefix}gestion@rutalibre.test`;
    const created = await http().post('/api/admin/users').set(admin()).send({
      email: managed, firstName: 'Sofía', lastName: 'Ramos', phone: '+593 99 765 4321', role: 'CUSTOMER', password: 'Inicial2026',
    }).expect(201);
    expect(created.body).toMatchObject({ email: managed, phone: '+593997654321', role: 'CUSTOMER', active: true });
    expect(created.body.passwordHash).toBeUndefined();

    await http().post('/api/admin/users').set(admin()).send({
      email: managed, firstName: 'Otra', lastName: 'Persona', role: 'CUSTOMER', password: 'Inicial2026',
    }).expect(409);
    await http().post('/api/admin/users').set(admin()).send({
      email: `${runPrefix}b@rutalibre.test`, firstName: 'Otra', lastName: 'Persona', role: 'CUSTOMER', password: 'corta',
    }).expect(400);
    await http().post('/api/auth/login').send({ email: managed, password: 'Inicial2026' }).expect(200);

    const edited = await http().patch(`/api/admin/users/${created.body.id}`).set(admin()).send({ firstName: 'Sofía Isabel', phone: null }).expect(200);
    expect(edited.body).toMatchObject({ firstName: 'Sofía Isabel', phone: null });

    await http().post(`/api/admin/users/${created.body.id}/password`).set(admin()).send({ password: 'Nueva2026x' }).expect(200);
    await http().post('/api/auth/login').send({ email: managed, password: 'Inicial2026' }).expect(401);
    await http().post('/api/auth/login').send({ email: managed, password: 'Nueva2026x' }).expect(200);

    await http().delete(`/api/admin/users/${created.body.id}`).set(admin()).expect(204);
    await http().post('/api/auth/login').send({ email: managed, password: 'Nueva2026x' }).expect(401);
    await http().delete('/api/admin/users/no-es-uuid').set(admin()).expect(404);
  });

  it('una cuenta con historial en ms-reservas no se elimina; desactivar o cambiar el rol aplica al instante', async () => {
    const login = await http().post('/api/auth/login').send({ email, password }).expect(200);
    const customer = { Authorization: `Bearer ${login.body.accessToken}` };
    const id = login.body.user.id;

    reservasUsage = [{ userId: id, reservations: 2, reviews: 1, blocks: 0 }];
    const res = await http().delete(`/api/admin/users/${id}`).set(admin()).expect(409);
    expect(res.body.detail).toMatch(/2 reserva\(s\), 1 reseña\(s\): desactiva la cuenta/);

    await http().patch(`/api/admin/users/${id}`).set(admin()).send({ active: false }).expect(200);
    await http().get('/api/auth/me').set(customer).expect(401);
    await http().post('/api/auth/login').send({ email, password }).expect(401);
    await http().patch(`/api/admin/users/${id}`).set(admin()).send({ active: true }).expect(200);
    await http().get('/api/auth/me').set(customer).expect(200);

    // Mismo token: al ascender a ADMIN entra al panel; al volver a CUSTOMER, no
    await http().patch(`/api/admin/users/${id}`).set(admin()).send({ role: 'ADMIN' }).expect(200);
    await http().get('/api/admin/users').set(customer).expect(200);
    await http().patch(`/api/admin/users/${id}`).set(admin()).send({ role: 'CUSTOMER' }).expect(200);
    await http().get('/api/admin/users').set(customer).expect(403);
  });

  it('el administrador no puede quitarse el rol, desactivarse ni eliminarse', async () => {
    const me = await http().get('/api/auth/me').set(admin()).expect(200);
    await http().patch(`/api/admin/users/${me.body.id}`).set(admin()).send({ role: 'CUSTOMER' }).expect(409);
    await http().patch(`/api/admin/users/${me.body.id}`).set(admin()).send({ active: false }).expect(409);
    await http().patch(`/api/admin/users/${me.body.id}`).set(admin()).send({ role: 'ROOT' }).expect(400);
    await http().delete(`/api/admin/users/${me.body.id}`).set(admin()).expect(409);
  });

  it('/health responde con el estado de la BD y la tabla vive en el schema identidad', async () => {
    const res = await http().get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'ms-identidad', database: 'up' });
    const [{ schema }] = await db().query(`SELECT table_schema AS schema FROM information_schema.tables WHERE table_name = 'users' AND table_type = 'BASE TABLE'`);
    expect(schema).toBe('identidad');
  });
});
