import { INestApplication } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parse } from 'yaml';

export const INTEGRATION_BASE_PATH = 'autos/v1';

export function resolveContractPath(configuredPath?: string): string {
  return configuredPath
    ? resolve(configuredPath)
    : resolve(process.cwd(), '..', 'contracts', 'autos-openapi.yaml');
}

/**
 * API-first: la documentación de la API de integración NO se genera desde el código.
 * Se sirve el contrato oficial autos-openapi.yaml tal cual:
 *   /autos/v1/openapi.yaml  → bytes exactos del archivo
 *   /autos/v1/docs          → Swagger UI
 *   /autos/v1/redoc         → Redoc
 * Solo en la copia en memoria para Swagger UI se antepone el servidor de esta instancia,
 * para que "Try it out" funcione. El archivo del contrato nunca se modifica.
 */
export function setupContractDocs(app: INestApplication, contractPath: string, publicBaseUrl?: string): void {
  const rawYaml = readFileSync(contractPath, 'utf8');
  const document = parse(rawYaml);

  const thisServer = publicBaseUrl
    ? `${publicBaseUrl.replace(/\/$/, '')}/${INTEGRATION_BASE_PATH}`
    : `/${INTEGRATION_BASE_PATH}`;
  const displayDocument = {
    ...document,
    servers: [{ url: thisServer, description: 'Esta instancia (RDA1)' }, ...(document.servers ?? [])],
  };

  const http = app.getHttpAdapter();
  http.get(`/${INTEGRATION_BASE_PATH}/openapi.yaml`, (_req, res) => {
    res.type('application/yaml').send(rawYaml);
  });
  http.get(`/${INTEGRATION_BASE_PATH}/redoc`, (_req, res) => {
    res.type('text/html').send(redocHtml(`/${INTEGRATION_BASE_PATH}/openapi.yaml`));
  });

  SwaggerModule.setup(`${INTEGRATION_BASE_PATH}/docs`, app, displayDocument, {
    customSiteTitle: 'GDS Autos Core API — contrato oficial',
  });
}

function redocHtml(specUrl: string): string {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>GDS Autos Core API — Redoc</title>
  </head>
  <body>
    <redoc spec-url="${specUrl}"></redoc>
    <script src="https://cdn.jsdelivr.net/npm/redoc@2/bundles/redoc.standalone.js"></script>
  </body>
</html>`;
}
