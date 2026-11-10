import { INestApplication } from '@nestjs/common';
import { SignJWT } from 'jose';
import request from 'supertest';

import { UserRole } from '../../src/domain/enums';
import { createApp } from '../contract/contract-app';
import { testUser } from '../identity-tokens';

/**
 * Fase B: ms-reservas ya no registra usuarios ni firma tokens (eso es ms-identidad). Aquí se prueba que acepta
 * solo tokens RS256 de ms-identidad y que respeta el rol que traen.
 */
describe('API interna — tokens de ms-identidad', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('un token válido de ms-identidad da acceso a las rutas del cliente', async () => {
    const customer = await testUser();
    await http().get('/api/me/reservations').set(customer.headers).expect(200);
  });

  it('sin token, alterado, expirado o de otro emisor → 401 ProblemDetails', async () => {
    await http().get('/api/me/reservations').expect(401);
    const res = await http().get('/api/me/reservations').set('Authorization', 'Bearer abc.def.ghi').expect(401);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ status: 401, code: 'VALIDATION_FAILED' });

    const expired = await testUser(UserRole.Customer, { expiresIn: '-1m' });
    await http().get('/api/me/reservations').set(expired.headers).expect(401);
    const foreign = await testUser(UserRole.Customer, { issuer: 'otro-emisor' });
    await http().get('/api/me/reservations').set(foreign.headers).expect(401);
  });

  it('rechaza los tokens HS256 del monolito anterior (aunque usen el mismo secreto)', async () => {
    const legacy = await new SignJWT({ email: 'admin@rutalibre.ec', role: 'ADMIN' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('rutalibre-identidad').setAudience('rutalibre-internal-api').setSubject('00000000-0000-0000-0000-000000000001')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(process.env.USER_JWT_SECRET!));
    await http().get('/api/admin/dashboard').set('Authorization', `Bearer ${legacy}`).expect(401);
  });

  it('el rol del token decide el acceso al panel: cliente → 403, ADMIN → 200', async () => {
    await http().get('/api/admin/dashboard').set((await testUser()).headers).expect(403);
    await http().get('/api/admin/dashboard').set((await testUser(UserRole.Admin)).headers).expect(200);
  });

  it('el registro, el login y la gestión de usuarios ya no están aquí (los atiende ms-identidad)', async () => {
    await http().post('/api/auth/login').send({ email: 'admin@rutalibre.ec', password: 'Admin12345!' }).expect(404);
    await http().post('/api/auth/register').send({}).expect(404);
    await http().get('/api/admin/users').set((await testUser(UserRole.Admin)).headers).expect(404);
  });
});
