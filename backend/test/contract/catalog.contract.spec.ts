import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp, futureDate, searchBody, useContract } from './contract-app';

/**
 * Tests de CONTRATO de la API de integración (catálogo). Cada respuesta real se valida contra
 * contracts/autos-openapi.yaml con `toSatisfyApiSpec()`: status declarado, schema, tipos, enums y
 * nombres de propiedades. Requiere BD con el seed.
 */
useContract();

describe('Contrato autos-openapi.yaml — catálogo', () => {
  let app: INestApplication;
  const AFFILIATE = '1001';

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  const post = (path: string, body: object = {}, affiliate: string | null = AFFILIATE) => {
    const req = request(app.getHttpServer()).post(`/autos/v1${path}`).send(body);
    return affiliate === null ? req : req.set('X-Affiliate-Id', affiliate);
  };

  describe('Control del validador', () => {
    it('detecta una respuesta que viola el contrato (tipo incorrecto / status no declarado)', async () => {
      const res = await post('/search', searchBody());
      const broken = { ...res, body: { ...res.body, data: [{ vehicle_id: 'x', price: 'gratis', supplier_id: 1 }] } };
      expect(broken).not.toSatisfyApiSpec();
      const undeclared = { ...res, status: 201, statusCode: 201 };
      expect(undeclared).not.toSatisfyApiSpec();
    });
  });

  describe('POST /search', () => {
    it('200: CarSearchResponse + Cache-Control', async () => {
      const res = await post('/search', searchBody());
      expect(res.status).toBe(200);
      expect(res).toSatisfyApiSpec();
      expect(res.headers['cache-control']).toBe('public, max-age=300');
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.search_token).toMatch(/^[0-9a-f-]{36}$/);
      expect(res.body.metadata.total_results).toBe(res.body.data.length);
    });

    it('resultados ordenados por precio y todos del proveedor de la agencia UIO', async () => {
      const { body } = await post('/search', searchBody());
      const prices = body.data.map((d: { price: number }) => d.price);
      expect(prices).toEqual([...prices].sort((a, b) => a - b));
      expect(new Set(body.data.map((d: { supplier_id: number }) => d.supplier_id))).toEqual(new Set([1]));
    });

    it('filtra por car_types y transmission', async () => {
      const res = await post('/search', searchBody({ filters: { car_types: ['SUV'], transmission: ['AUTOMATIC'] } }));
      expect(res).toSatisfyApiSpec();
      expect(res.body.data).toHaveLength(1); // Kia Sportage (Andes, UIO)
    });

    it('convierte a EUR', async () => {
      const usd = await post('/search', searchBody());
      const eur = await post('/search', searchBody({ currency: 'EUR' }));
      expect(eur).toSatisfyApiSpec();
      expect(eur.body.data[0].price).toBeLessThan(usd.body.data[0].price);
    });

    it('conductor de 21 años: excluye categorías con edad mínima mayor', async () => {
      const res = await post('/search', searchBody({ driver: { age: 21 } }));
      expect(res).toSatisfyApiSpec();
      expect(res.body.data).toHaveLength(2); // solo ECONOMY y COMPACT (mínimo 21)
    });

    it('agencia cerrada a la hora pedida: sin resultados (no es error)', async () => {
      const closed = searchBody({
        route: {
          pickup: { datetime: futureDate(10, 3), location: { airport: 'UIO' } }, // 03:00 local: aeropuerto abre a las 05:00
          dropoff: { datetime: futureDate(13), location: { airport: 'UIO' } },
        },
      });
      const res = await post('/search', closed);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('400 VALIDATION_FAILED sin X-Affiliate-Id', async () => {
      const res = await post('/search', searchBody(), null);
      expect(res.status).toBe(400);
      expect(res).toSatisfyApiSpec();
      expect(res.headers['content-type']).toContain('application/problem+json');
    });

    it('400 con invalidParams por campos inválidos del contrato', async () => {
      const res = await post('/search', { ...searchBody(), currency: 'usd', booker: { country: 'EC' }, driver: { age: 17 } });
      expect(res.status).toBe(400);
      expect(res).toSatisfyApiSpec();
      const names = res.body.invalidParams.map((p: { name: string }) => p.name);
      expect(names).toEqual(expect.arrayContaining(['currency', 'booker.country', 'driver.age']));
    });

    it('400 si la devolución es anterior a la recogida', async () => {
      const res = await post('/search', searchBody({
        route: {
          pickup: { datetime: futureDate(13), location: { airport: 'UIO' } },
          dropoff: { datetime: futureDate(10), location: { airport: 'UIO' } },
        },
      }));
      expect(res.status).toBe(400);
      expect(res).toSatisfyApiSpec();
    });

    it('400 con moneda bien formada pero no soportada', async () => {
      const res = await post('/search', searchBody({ currency: 'JPY' }));
      expect(res.status).toBe(400);
      expect(res).toSatisfyApiSpec();
      expect(res.body.invalidParams[0].name).toBe('currency');
    });

    it('maximum_results limita la página y next_page es null si no hay más', async () => {
      const first = await post('/search', searchBody({ maximum_results: 10 }));
      const all = first.body.data.length;
      expect(first.body.metadata.next_page).toBeNull();
      expect(all).toBeLessThanOrEqual(10);
    });
  });

  describe('Agencias, proveedores, detalles y constantes', () => {
    it('POST /depots 200 con paginación por cursor', async () => {
      const first = await post('/depots', { maximum_results: 4 });
      expect(first.status).toBe(200);
      expect(first).toSatisfyApiSpec();
      expect(first.headers['cache-control']).toBe('public, max-age=3600');
      expect(first.body.data).toHaveLength(4);

      const second = await post('/depots', { maximum_results: 4, page: first.body.metadata.next_page });
      expect(second).toSatisfyApiSpec();
      expect(second.body.data.map((d: { depot_id: number }) => d.depot_id)).toEqual([5, 6]);
      expect(second.body.metadata.next_page).toBeNull();
    });

    it('POST /depots sin body también responde 200 (requestBody opcional)', async () => {
      const res = await request(app.getHttpServer()).post('/autos/v1/depots').set('X-Affiliate-Id', AFFILIATE);
      expect(res.status).toBe(200);
      expect(res).toSatisfyApiSpec();
    });

    it('POST /depots/reviews/scores 200 (score 0–10)', async () => {
      const res = await post('/depots/reviews/scores');
      expect(res.status).toBe(200);
      expect(res).toSatisfyApiSpec();
      expect(res.headers['cache-control']).toBe('public, max-age=600');
      for (const { score } of res.body.data) expect(score).toBeGreaterThanOrEqual(0);
    });

    it('POST /details 200', async () => {
      const res = await post('/details', { maximum_results: 50 });
      expect(res.status).toBe(200);
      expect(res).toSatisfyApiSpec();
      expect(res.headers['cache-control']).toBe('public, max-age=300');
      expect(res.body.data[0]).toEqual(expect.objectContaining({ vehicle_id: expect.any(String), seats: expect.any(Number) }));
    });

    it('POST /suppliers 200 y filtro por ids', async () => {
      const all = await post('/suppliers');
      expect(all).toSatisfyApiSpec();
      expect(all.headers['cache-control']).toBe('public, max-age=3600');
      const only = await post('/suppliers', { suppliers: [2] });
      expect(only.body.data).toEqual([{ supplier_id: 2, name: 'Pacífico Car Rental' }]);
    });

    it('POST /constants 200 con todas las claves del enum', async () => {
      const res = await post('/constants');
      expect(res.status).toBe(200);
      expect(res).toSatisfyApiSpec();
      expect(res.headers['cache-control']).toBe('public, max-age=86400');
      expect(Object.keys(res.body.data).sort()).toEqual(
        ['depot_services', 'fuel_policies', 'fuel_types', 'general', 'payment_timings', 'transmission'],
      );
    });

    it('POST /constants rechaza claves fuera del enum', async () => {
      const res = await post('/constants', { constants: ['colors'] });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('Rate limit', () => {
    it('429 RATE_LIMIT_EXCEEDED con Retry-After al superar el límite de /search', async () => {
      const body = searchBody();
      let last: request.Response | undefined;
      for (let i = 0; i < 61; i++) last = await post('/search', body, '9999'); // afiliado propio: no afecta a otros tests
      expect(last!.status).toBe(429);
      expect(last!).toSatisfyApiSpec();
      expect(last!.body.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(Number(last!.headers['retry-after'])).toBeGreaterThan(0);
    });
  });
});
