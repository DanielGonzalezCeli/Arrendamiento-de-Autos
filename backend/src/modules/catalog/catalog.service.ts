import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { DomainError } from '../../domain/domain-error';
import { CurrencyRate } from './entities/currency-rate.entity';
import { Depot } from './entities/depot.entity';
import { Extra } from './entities/extra.entity';
import { Rate } from './entities/rate.entity';
import { Supplier } from './entities/supplier.entity';
import { VehicleCategory } from './entities/vehicle-category.entity';
import { VehicleModel } from './entities/vehicle-model.entity';

/** Consultas de catálogo compartidas por la API interna y la API de integración. */
@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(Depot) private readonly depots: Repository<Depot>,
    @InjectRepository(VehicleModel) private readonly models: Repository<VehicleModel>,
    @InjectRepository(Supplier) private readonly suppliers: Repository<Supplier>,
    @InjectRepository(VehicleCategory) private readonly categories: Repository<VehicleCategory>,
    @InjectRepository(Extra) private readonly extras: Repository<Extra>,
    @InjectRepository(Rate) private readonly rates: Repository<Rate>,
    @InjectRepository(CurrencyRate) private readonly currencyRates: Repository<CurrencyRate>,
  ) {}

  /** Agencias activas con horario y ciudad; `modifiedSince` implementa last_modified del contrato. */
  activeDepots(modifiedSince?: Date): Promise<Depot[]> {
    return this.depots.find({
      where: { active: true, ...(modifiedSince ? { updatedAt: MoreThanOrEqual(modifiedSince) } : {}) },
      relations: { openingHours: true, city: true, supplier: true },
      order: { id: 'ASC' },
    });
  }

  /** Modelos publicados y activos (los únicos visibles en el marketplace y en /search). */
  publishedModels(modifiedSince?: Date): Promise<VehicleModel[]> {
    return this.models.find({
      where: { active: true, published: true, ...(modifiedSince ? { updatedAt: MoreThanOrEqual(modifiedSince) } : {}) },
      relations: { category: true, supplier: true },
      order: { supplierId: 'ASC', make: 'ASC', model: 'ASC' },
    });
  }

  /** Modelo activo aunque ya no esté publicado (las reservas existentes lo siguen necesitando). */
  findModel(id: string): Promise<VehicleModel | null> {
    return this.models.findOne({ where: { id, active: true }, relations: { category: true, supplier: true } });
  }

  findDepot(id: number): Promise<Depot | null> {
    return this.depots.findOne({ where: { id, active: true }, relations: { openingHours: true, city: true, supplier: true } });
  }

  findPublishedModel(id: string): Promise<VehicleModel | null> {
    return this.models.findOne({ where: { id, active: true, published: true }, relations: { category: true, supplier: true } });
  }

  activeSuppliers(ids?: number[]): Promise<Supplier[]> {
    return this.suppliers.find({
      where: { active: true, ...(ids?.length ? { id: In(ids) } : {}) },
      order: { id: 'ASC' },
    });
  }

  listCategories(): Promise<VehicleCategory[]> {
    return this.categories.find({ order: { sortOrder: 'ASC' } });
  }

  activeExtras(codes?: string[]): Promise<Extra[]> {
    return this.extras.find({
      where: { active: true, ...(codes ? { code: In(codes) } : {}) },
      order: { type: 'ASC', name: 'ASC' },
    });
  }

  /** Tarifa vigente para un proveedor y categoría en una fecha (YYYY-MM-DD). */
  findRate(supplierId: number, categoryId: string, date: string): Promise<Rate | null> {
    return this.rates.findOne({
      where: { supplierId, categoryId, validFrom: LessThanOrEqual(date), validTo: MoreThanOrEqual(date) },
    });
  }

  /** RN13: tasa desde USD. Un código ISO bien formado pero sin tasa configurada es un 400 en `currency`. */
  async rateFromUsd(currency: string): Promise<number> {
    const rate = await this.currencyRates.findOne({ where: { currency } });
    if (!rate) {
      throw DomainError.validation(`La moneda ${currency} no está soportada`, [
        { name: 'currency', reason: 'moneda no soportada' },
      ]);
    }
    return rate.rateFromUsd;
  }

  async supportedCurrencies(): Promise<string[]> {
    const rates = await this.currencyRates.find({ order: { currency: 'ASC' } });
    return rates.map((r) => r.currency);
  }
}
