import { INestApplication } from '@nestjs/common';
import { createServer, IncomingMessage, Server } from 'http';
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
  });
});
