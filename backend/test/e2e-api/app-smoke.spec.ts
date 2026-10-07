import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { parse } from 'yaml';

import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';

/** Requiere PostgreSQL accesible en DATABASE_URL (docker compose up -d, o el servicio de CI). */
describe('Smoke de la aplicación', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /health responde 200 con la BD conectada', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'up' });
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('GET /api/status es el mismo chequeo para la web (los bloqueadores de anuncios bloquean /health)', async () => {
    const res = await request(app.getHttpServer()).get('/api/status').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'up' });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('GET /autos/v1/openapi.yaml sirve el contrato oficial', async () => {
    const res = await request(app.getHttpServer()).get('/autos/v1/openapi.yaml').expect(200);
    expect(parse(res.text).info.title).toBe('GDS Autos Core API');
  });

  it('GET /autos/v1/docs sirve Swagger UI', async () => {
    await request(app.getHttpServer()).get('/autos/v1/docs/').expect(200);
  });

  it('GET /autos/v1/redoc sirve Redoc', async () => {
    const res = await request(app.getHttpServer()).get('/autos/v1/redoc').expect(200);
    expect(res.text).toContain('/autos/v1/openapi.yaml');
  });
});
