import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AvailabilityModule } from '../availability/availability.module';
import { CatalogModule } from '../catalog/catalog.module';
import { SearchSession } from '../orders/entities/search-session.entity';
import { SearchService } from './search.service';

@Module({
  imports: [TypeOrmModule.forFeature([SearchSession]), CatalogModule, AvailabilityModule],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
