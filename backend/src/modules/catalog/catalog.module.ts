import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogService } from './catalog.service';
import { ConstantsService } from './constants.service';
import { CurrencyRate } from './entities/currency-rate.entity';
import { Depot } from './entities/depot.entity';
import { Extra } from './entities/extra.entity';
import { Rate } from './entities/rate.entity';
import { Supplier } from './entities/supplier.entity';
import { VehicleCategory } from './entities/vehicle-category.entity';
import { VehicleModel } from './entities/vehicle-model.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Depot, VehicleModel, Supplier, VehicleCategory, Extra, Rate, CurrencyRate])],
  providers: [CatalogService, ConstantsService],
  exports: [CatalogService, ConstantsService],
})
export class CatalogModule {}
