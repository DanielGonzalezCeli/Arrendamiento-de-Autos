import { INestApplication, Type } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export const INTERNAL_BASE_PATH = 'api';

/**
 * OpenAPI de la API INTERNA (la que usa nuestro frontend), generado desde los decoradores.
 * Se publica aparte (/api/docs) para no mezclarlo con el contrato oficial (/autos/v1/docs).
 */
export function setupInternalDocs(app: INestApplication, modules: Type<unknown>[]): void {
  const config = new DocumentBuilder()
    .setTitle('RutaLibre — API interna')
    .setDescription('API para el marketplace y el panel de administración. No forma parte del contrato con Booking Hub.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config, { include: modules });
  SwaggerModule.setup(`${INTERNAL_BASE_PATH}/docs`, app, document, { customSiteTitle: 'RutaLibre — API interna' });
}
