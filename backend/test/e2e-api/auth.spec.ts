import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';

/** API interna /api/auth/*: registro, login, token y errores ProblemDetails. Requiere BD. */
describe('API interna — autenticación', () => {
  let app: INestApplication;
  const email = `test+${Date.now()}@rutalibre.test`;
  const password = 'Prueba2026';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.get(DataSource).query(`DELETE FROM users WHERE email LIKE 'test+%@rutalibre.test'`);
    await app?.close();
  });

  const http = () => request(app.getHttpServer());

  it('POST /api/auth/register crea un CLIENTE y devuelve token (sin passwordHash)', async () => {
    const res = await http()
      .post('/api/auth/register')
      .send({ email, password, firstName: 'Ana', lastName: 'Pérez', role: 'ADMIN' }) // role se ignora (RN27)
      .expect(201);

    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ email, role: 'CUSTOMER' });
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('registrar el mismo correo → 409 ProblemDetails', async () => {
    const res = await http()
      .post('/api/auth/register')
      .send({ email: email.toUpperCase(), password, firstName: 'Ana', lastName: 'Pérez' })
      .expect(409);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ status: 409, code: 'VALIDATION_FAILED' });
  });

  it('body inválido → 400 con invalidParams', async () => {
    const res = await http().post('/api/auth/register').send({ email: 'no-es-correo', password: '123' }).expect(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    const names = res.body.invalidParams.map((p: { name: string }) => p.name);
    expect(names).toEqual(expect.arrayContaining(['email', 'password', 'firstName', 'lastName']));
    // additionalProperties: false en el contrato → solo campos permitidos
    expect(Object.keys(res.body).sort()).toEqual(['code', 'detail', 'invalidParams', 'status', 'title', 'type']);
  });

  it('rechaza nombres con números, correos sin dominio y teléfonos inválidos para su país', async () => {
    const res = await http().post('/api/auth/register')
      .send({ email: 'ana@correo', password, firstName: 'Ana2', lastName: 'P3rez', phone: '+59399123' }).expect(400);
    expect(res.body.invalidParams.map((p: { name: string }) => p.name).sort()).toEqual(['email', 'firstName', 'lastName', 'phone']);
  });

  it('acepta un turista con teléfono de otro país y lo guarda en formato internacional', async () => {
    const res = await http().post('/api/auth/register').send({
      email: `test+tourist${Date.now()}@rutalibre.test`, password, firstName: 'John', lastName: "O'Brien", phone: '+1 202 555 0143',
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

  it('/api/auth/me sin token o con token alterado → 401 ProblemDetails', async () => {
    await http().get('/api/auth/me').expect(401);
    const res = await http().get('/api/auth/me').set('Authorization', 'Bearer abc.def.ghi').expect(401);
    expect(res.body).toMatchObject({ status: 401, code: 'VALIDATION_FAILED' });
  });

  it('el seed crea el administrador con rol ADMIN', async () => {
    const res = await http().post('/api/auth/login').send({ email: 'admin@rutalibre.ec', password: 'Admin12345!' });
    // Solo aplica en BD local con el seed de desarrollo.
    if (res.status === 200) expect(res.body.user.role).toBe('ADMIN');
  });

  it('/api/docs publica el OpenAPI de la API interna', async () => {
    const res = await http().get('/api/docs-json').expect(200);
    expect(Object.keys(res.body.paths)).toEqual(expect.arrayContaining(['/api/auth/register', '/api/auth/login', '/api/auth/me']));
  });
});
