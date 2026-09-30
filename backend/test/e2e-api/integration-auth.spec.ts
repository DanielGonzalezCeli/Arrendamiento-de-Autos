import { INestApplication } from '@nestjs/common';
import { generateKeyPair, SignJWT } from 'jose';
import request from 'supertest';
import { createApp } from '../contract/contract-app';

/**
 * Seguridad ENTRE SISTEMAS: emisor OAuth2 local (client_credentials), verificación RS256 y scopes.
 * Credenciales del cliente de demo creadas por el seed de desarrollo.
 */
describe('API de integración — OAuth2 y scopes', () => {
  let app: INestApplication;
  const CLIENT_ID = 'booking-hub-demo';
  const CLIENT_SECRET = process.env.SEED_HUB_CLIENT_SECRET || 'hub-demo-secret-2026';

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  const http = () => request(app.getHttpServer());

  async function token(scope?: string): Promise<string> {
    const res = await http()
      .post('/oauth2/token')
      .type('form')
      .send({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...(scope ? { scope } : {}) })
      .expect(200);
    return res.body.access_token;
  }

  describe('POST /oauth2/token (emisor local RDA1, fuera del contrato)', () => {
    it('emite un JWT RS256 con scopes como array y sub = client:<id>', async () => {
      const res = await http()
        .post('/oauth2/token')
        .type('form')
        .send({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope: 'autos:read autos:book' })
        .expect(200);
      expect(res.body).toMatchObject({ token_type: 'Bearer', expires_in: expect.any(Number), scope: 'autos:read autos:book' });
      expect(res.headers['cache-control']).toBe('no-store');

      const [header, payload] = res.body.access_token.split('.').slice(0, 2).map((p: string) => JSON.parse(Buffer.from(p, 'base64url').toString()));
      expect(header.alg).toBe('RS256');
      expect(payload).toMatchObject({ sub: `client:${CLIENT_ID}`, scopes: ['autos:read', 'autos:book'], aud: 'autos-api', affiliate_id: 1001 });
    });

    it('acepta credenciales por HTTP Basic', async () => {
      await http().post('/oauth2/token').auth(CLIENT_ID, CLIENT_SECRET).type('form').send({ grant_type: 'client_credentials' }).expect(200);
    });

    it('invalid_client (401), unsupported_grant_type (400), invalid_scope (400)', async () => {
      const bad = await http().post('/oauth2/token').type('form').send({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: 'x' });
      expect(bad.status).toBe(401);
      expect(bad.body.error).toBe('invalid_client');

      const grant = await http().post('/oauth2/token').type('form').send({ grant_type: 'password', client_id: CLIENT_ID, client_secret: CLIENT_SECRET });
      expect(grant.body.error).toBe('unsupported_grant_type');

      const scope = await http().post('/oauth2/token').type('form')
        .send({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope: 'autos:admin' });
      expect(scope.status).toBe(400);
      expect(scope.body.error).toBe('invalid_scope');
    });

    it('publica el JWKS con la clave pública', async () => {
      const res = await http().get('/.well-known/jwks.json').expect(200);
      expect(res.body.keys[0]).toMatchObject({ kty: 'RSA', alg: 'RS256', use: 'sig', kid: expect.any(String) });
      expect(res.body.keys[0].d).toBeUndefined(); // nunca la parte privada
    });
  });

  describe('Protección de los endpoints según `security` del contrato', () => {
    it('401 sin token', async () => {
      const res = await http().post('/autos/v1/orders/preview').send({});
      expect(res.status).toBe(401);
      expect(res.headers['content-type']).toContain('application/problem+json');
    });

    it('401 con un token firmado por otra clave (emisor falso)', async () => {
      const { privateKey } = await generateKeyPair('RS256');
      const forged = await new SignJWT({ scopes: ['autos:read'] })
        .setProtectedHeader({ alg: 'RS256' }).setIssuer('rutalibre-local-idp').setAudience('autos-api')
        .setSubject('client:attacker').setIssuedAt().setExpirationTime('5m').sign(privateKey);
      await http().post('/autos/v1/orders/preview').set('Authorization', `Bearer ${forged}`).send({}).expect(401);
    });

    it('403 si el token no tiene el scope del endpoint', async () => {
      const readOnly = await token('autos:read');
      const res = await http().post('/autos/v1/orders/abc/cancel').set('Authorization', `Bearer ${readOnly}`);
      expect(res.status).toBe(403);
      expect(res.body.detail).toContain('autos:cancel');
    });

    it('con el scope correcto pasa la seguridad (la operación aún no está implementada → 501)', async () => {
      const readToken = await token('autos:read');
      await http().post('/autos/v1/orders/preview').set('Authorization', `Bearer ${readToken}`).send({}).expect(501);
    });

    it('orders/create exige Idempotency-Key UUID (400) después de autenticar', async () => {
      const bookToken = await token('autos:book');
      const res = await http().post('/autos/v1/orders/create').set('Authorization', `Bearer ${bookToken}`).send({});
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('el token web de usuario NO sirve en la API de integración', async () => {
      const login = await http().post('/api/auth/login').send({ email: 'cliente@rutalibre.ec', password: 'Cliente12345!' });
      if (login.status !== 200) return; // solo con el seed de desarrollo
      await http().get('/autos/v1/webhooks').set('Authorization', `Bearer ${login.body.accessToken}`).expect(401);
    });
  });
});
