import { INestApplication } from '@nestjs/common';
import { generateKeyPairSync } from 'crypto';
import { createServer, IncomingMessage, Server } from 'http';
import { SignJWT } from 'jose';
import { AddressInfo } from 'net';
import request from 'supertest';

import { GatewayConfig, loadConfig } from '../src/config';
import { clientIp, normalizeIp } from '../src/http-helpers';
import { createGateway } from '../src/main';
import { resolveRoute } from '../src/routes';

/** Microservicio falso: devuelve lo que recibió (método, ruta, cabeceras y cuerpo). `/lento` tarda 500 ms. */
function startEchoService(): Promise<Server> {
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const reply = () => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ method: req.method, url: req.url, headers: req.headers, body }));
      };
      if (req.url === '/lento') setTimeout(reply, 500);
      else reply();
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const urlOf = (server: Server) => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

function configFor(serviceUrl: string, overrides: Partial<GatewayConfig> = {}): GatewayConfig {
  return { ...loadConfig({ LOG_LEVEL: 'silent' }), services: { 'ms-reservas': serviceUrl }, proxyTimeoutMs: 200, ...overrides };
}

describe('API Gateway', () => {
  let upstream: Server;
  let app: INestApplication;

  beforeAll(async () => {
    upstream = await startEchoService();
    app = await createGateway(configFor(urlOf(upstream)));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await new Promise((resolve) => upstream.close(resolve));
  });

  it('reenvía método, ruta, query y cuerpo intactos al microservicio', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v3/autos/reservas?x=1')
      .set('Content-Type', 'application/json')
      .set('X-API-Key', 'clave')
      .set('Idempotency-Key', 'abc')
      .send({ vehicle_id: 'auto-pan-1001' })
      .expect(200);
    expect(res.body).toMatchObject({ method: 'POST', url: '/api/v3/autos/reservas?x=1', body: '{"vehicle_id":"auto-pan-1001"}' });
    expect(res.body.headers).toMatchObject({ 'x-api-key': 'clave', 'idempotency-key': 'abc' });
    expect(res.headers['x-upstream-service']).toBe('ms-reservas');
  });

  it('propaga el X-Correlation-Id entrante al microservicio y en la respuesta', async () => {
    const res = await request(app.getHttpServer()).get('/api/v3/health').set('X-Correlation-Id', 'cid-booking-123').expect(200);
    expect(res.body.headers['x-correlation-id']).toBe('cid-booking-123');
    expect(res.headers['x-correlation-id']).toBe('cid-booking-123');
  });

  it('genera un X-Correlation-Id si no llega ninguno', async () => {
    const res = await request(app.getHttpServer()).get('/api/v3/autos').expect(200);
    expect(res.headers['x-correlation-id']).toMatch(/^cid-gw-[0-9a-f]{8}$/);
    expect(res.body.headers['x-correlation-id']).toBe(res.headers['x-correlation-id']);
  });

  it('el microservicio recibe la IP del cliente en X-Forwarded-For (sin cadenas falsas)', async () => {
    const res = await request(app.getHttpServer()).get('/health').set('X-Forwarded-For', '6.6.6.6').expect(200);
    // Sin proxies de confianza (TRUST_PROXY_HOPS=0) se ignora lo que diga el cliente.
    expect(res.body.headers['x-forwarded-for']).toBe('127.0.0.1');
  });

  it('timeout del microservicio → 504 UPSTREAM_TIMEOUT en Problem Details', async () => {
    const res = await request(app.getHttpServer()).get('/lento').set('X-Correlation-Id', 'cid-lento').expect(504);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ status: 504, code: 'UPSTREAM_TIMEOUT', correlation_id: 'cid-lento', instance: '/lento' });
  });

  it('/gateway/health agrega la salud de cada microservicio', async () => {
    const res = await request(app.getHttpServer()).get('/gateway/health').expect(200);
    expect(res.body).toMatchObject({ status: 'HEALTHY', gateway: 'UP', services: { 'ms-reservas': { status: 'UP' } } });
  });
});

describe('API Gateway — microservicio caído', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Puerto cerrado: nadie escucha ahí.
    const closed = await startEchoService();
    const url = urlOf(closed);
    await new Promise((resolve) => closed.close(resolve));
    app = await createGateway(configFor(url));
    await app.init();
  });

  afterAll(() => app.close());

  it('→ 502 UPSTREAM_UNAVAILABLE y la salud agregada queda DEGRADED (503)', async () => {
    const res = await request(app.getHttpServer()).get('/api/v3/autos').expect(502);
    expect(res.body).toMatchObject({ status: 502, code: 'UPSTREAM_UNAVAILABLE' });
    expect(res.body.correlation_id).toBe(res.headers['x-correlation-id']);

    const health = await request(app.getHttpServer()).get('/gateway/health').expect(503);
    expect(health.body).toMatchObject({ status: 'DEGRADED', services: { 'ms-reservas': { status: 'DOWN' } } });
  });
});

describe('API Gateway — límite de peticiones por IP', () => {
  let upstream: Server;
  let app: INestApplication;

  beforeAll(async () => {
    upstream = await startEchoService();
    app = await createGateway(configFor(urlOf(upstream), { rateLimitPerMinute: 2 }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await new Promise((resolve) => upstream.close(resolve));
  });

  it('la tercera petición del minuto → 429 RATE_LIMITED; /gateway/health no cuenta', async () => {
    const http = app.getHttpServer();
    await request(http).get('/api/v3/autos').expect(200);
    await request(http).get('/api/v3/autos').expect(200);
    const res = await request(http).get('/api/v3/autos').expect(429);
    expect(res.body).toMatchObject({ status: 429, code: 'RATE_LIMITED' });
    await request(http).get('/gateway/health').expect(200);
  });
});

describe('Gateway — utilidades', () => {
  it('tabla de rutas: gana el prefijo más largo', () => {
    const routes = [{ prefix: '/', service: 'ms-reservas' }, { prefix: '/api/auth', service: 'ms-identidad' }];
    expect(resolveRoute('/api/auth/login', routes)?.service).toBe('ms-identidad');
    expect(resolveRoute('/api/authors', routes)?.service).toBe('ms-reservas');
    expect(resolveRoute('/api/v3/autos', routes)?.service).toBe('ms-reservas');
  });

  it('tabla real (fase B): auth y usuarios → ms-identidad; el resto del panel y Booking → ms-reservas', () => {
    expect(resolveRoute('/api/auth/me')?.service).toBe('ms-identidad');
    expect(resolveRoute('/api/admin/users')?.service).toBe('ms-identidad');
    expect(resolveRoute('/api/admin/users/123/password')?.service).toBe('ms-identidad');
    expect(resolveRoute('/api/admin/user-usage')?.service).toBe('ms-reservas');
    expect(resolveRoute('/api/admin/dashboard')?.service).toBe('ms-reservas');
    expect(resolveRoute('/api/v3/autos/reservas')?.service).toBe('ms-reservas');
    expect(resolveRoute('/.well-known/jwks.json')?.service).toBe('ms-reservas');
  });

  it('tabla real (fase C): clientes del contrato v3.1 → ms-clientes; el resto de /api/v3 sigue en ms-reservas', () => {
    expect(resolveRoute('/api/v3/clientes')?.service).toBe('ms-clientes');
    expect(resolveRoute('/api/v3/clientes/123')?.service).toBe('ms-clientes');
    expect(resolveRoute('/api/v3/clientesx')?.service).toBe('ms-reservas');
    expect(resolveRoute('/api/v3/reservas')?.service).toBe('ms-reservas');
    expect(resolveRoute('/internal/clientes')?.service).toBe('ms-reservas'); // la API interna de ms-clientes no se publica
  });

  it('normaliza IPs con puerto o IPv4 mapeada', () => {
    expect(normalizeIp('1.2.3.4:5678')).toBe('1.2.3.4');
    expect(normalizeIp('::ffff:10.0.0.1')).toBe('10.0.0.1');
    expect(normalizeIp('[2001:db8::1]:443')).toBe('2001:db8::1');
    expect(normalizeIp('2001:db8::1')).toBe('2001:db8::1');
  });

  it('IP del cliente detrás de N proxies de confianza (Azure agrega la suya a la derecha)', () => {
    const req = (xff?: string) => ({ headers: xff ? { 'x-forwarded-for': xff } : {}, socket: { remoteAddress: '::ffff:169.254.0.1' } }) as unknown as IncomingMessage;
    expect(clientIp(req('6.6.6.6, 190.1.2.3:51000'), 1)).toBe('190.1.2.3');
    expect(clientIp(req('190.1.2.3:51000'), 0)).toBe('169.254.0.1');
    expect(clientIp(req(), 1)).toBe('169.254.0.1');
  });

  it('valida la configuración', () => {
    expect(() => loadConfig({ MS_RESERVAS_URL: 'ftp://x' })).toThrow('MS_RESERVAS_URL');
    expect(() => loadConfig({ RATE_LIMIT_PER_MINUTE: '-1' })).toThrow('RATE_LIMIT_PER_MINUTE');
    expect(loadConfig({}).services['ms-reservas']).toBe('http://localhost:3000');
    expect(loadConfig({ MS_IDENTIDAD_URL: 'https://idn.example/' }).services['ms-identidad']).toBe('https://idn.example');
    expect(() => loadConfig({ MS_IDENTIDAD_URL: 'idn' })).toThrow('MS_IDENTIDAD_URL');
    expect(loadConfig({}).services['ms-clientes']).toBe('http://localhost:3003');
    expect(loadConfig({}).services['ms-inventario']).toBe('http://localhost:3004');
    // ms-inventario no tiene rutas públicas: ningún prefijo lo apunta
    expect(['/internal/stock', '/api/v3/inventory/stock', '/api/admin/booking'].map((p) => resolveRoute(p)?.service)).not.toContain('ms-inventario');
  });
});

describe('API Gateway — dos microservicios', () => {
  let reservas: Server;
  let identidad: Server;
  let app: INestApplication;

  beforeAll(async () => {
    [reservas, identidad] = await Promise.all([startEchoService(), startEchoService()]);
    app = await createGateway(configFor(urlOf(reservas), {
      services: { 'ms-reservas': urlOf(reservas), 'ms-identidad': urlOf(identidad) },
    }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await Promise.all([reservas, identidad].map((s) => new Promise((resolve) => s.close(resolve))));
  });

  it('enruta cada petición a su servicio con la misma ruta y el mismo correlation id', async () => {
    const login = await request(app.getHttpServer()).post('/api/auth/login').set('X-Correlation-Id', 'cid-fase-b').send({ email: 'a@b.ec' }).expect(200);
    expect(login.headers['x-upstream-service']).toBe('ms-identidad');
    expect(login.body).toMatchObject({ url: '/api/auth/login', body: '{"email":"a@b.ec"}' });
    expect(login.body.headers['x-correlation-id']).toBe('cid-fase-b');

    const search = await request(app.getHttpServer()).get('/api/admin/dashboard').expect(200);
    expect(search.headers['x-upstream-service']).toBe('ms-reservas');
  });

  it('la salud agregada incluye a ms-identidad', async () => {
    const res = await request(app.getHttpServer()).get('/gateway/health').expect(200);
    expect(res.body.services).toMatchObject({ 'ms-reservas': { status: 'UP' }, 'ms-identidad': { status: 'UP' } });
  });
});

describe('API Gateway — fase E: métricas y rutas internas', () => {
  let upstream: Server;
  let app: INestApplication;
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const token = (role: string) => new SignJWT({ role })
    .setProtectedHeader({ alg: 'RS256' }).setIssuer('rutalibre-identidad').setAudience('rutalibre-internal-api')
    .setSubject('u1').setExpirationTime('5m').sign(privateKey);

  beforeAll(async () => {
    upstream = await startEchoService();
    app = await createGateway(configFor(urlOf(upstream), {
      services: { 'ms-reservas': urlOf(upstream), 'ms-identidad': urlOf(upstream) },
      identityPublicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      corsOrigins: ['https://web.example'],
    }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await new Promise((resolve) => upstream.close(resolve));
  });

  it('las rutas internas y /metrics de los microservicios no se publican (404, no llegan al microservicio)', async () => {
    for (const path of ['/internal/clientes', '/internal/stock', '/internal', '/metrics']) {
      const res = await request(app.getHttpServer()).get(path).expect(404);
      expect(res.body).toMatchObject({ code: 'NOT_FOUND' });
      expect(res.headers['x-upstream-service']).toBeUndefined();
    }
    // Una ruta que solo empieza parecido sí se reenvía
    await request(app.getHttpServer()).get('/internalidad').expect(200);
  });

  it('/gateway/metrics: sin token → 401; cliente → 403; ADMIN → Prometheus con las métricas del gateway', async () => {
    await request(app.getHttpServer()).get('/gateway/metrics').expect(401);
    await request(app.getHttpServer()).get('/gateway/metrics').set('Authorization', `Bearer ${await token('CUSTOMER')}`).expect(403);
    await request(app.getHttpServer()).get('/api/v3/autos').expect(200);
    const res = await request(app.getHttpServer()).get('/gateway/metrics').set('Authorization', `Bearer ${await token('ADMIN')}`).expect(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toMatch(/gateway_requests_total\{[^}]*upstream="ms-reservas"[^}]*status="200"[^}]*service="gateway"\} \d+/);
    expect(res.text).toMatch(/gateway_requests_total\{[^}]*upstream="bloqueada"[^}]*status="404"/);
    expect(res.text).toContain('gateway_request_duration_seconds_bucket');
  });

  it('/gateway/metrics/{servicio} trae el /metrics del microservicio; un servicio desconocido → 404', async () => {
    const admin = { Authorization: `Bearer ${await token('ADMIN')}` };
    const res = await request(app.getHttpServer()).get('/gateway/metrics/ms-reservas').set(admin).expect(200);
    expect(JSON.parse(res.text)).toMatchObject({ method: 'GET', url: '/metrics' }); // el servicio falso devuelve lo que recibió
    await request(app.getHttpServer()).get('/gateway/metrics/ms-inexistente').set(admin).expect(404);
  });

  it('CORS de /gateway/* solo para los orígenes configurados (panel de observabilidad)', async () => {
    const ok = await request(app.getHttpServer()).options('/gateway/metrics/ms-reservas').set('Origin', 'https://web.example').expect(204);
    expect(ok.headers['access-control-allow-origin']).toBe('https://web.example');
    expect(ok.headers['access-control-allow-headers']).toContain('Authorization');
    const other = await request(app.getHttpServer()).options('/gateway/metrics').set('Origin', 'https://malicioso.example').expect(204);
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });
});
