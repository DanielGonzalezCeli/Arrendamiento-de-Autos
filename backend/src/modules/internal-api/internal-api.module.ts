import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { SearchModule } from '../search/search.module';
import { PublicCatalogController } from './public-catalog.controller';

/** API interna (/api) para el frontend: reutiliza los mismos servicios de dominio que la API de integración. */
@Module({
  imports: [CatalogModule, SearchModule],
  controllers: [PublicCatalogController],
})
export class InternalApiModule {}
