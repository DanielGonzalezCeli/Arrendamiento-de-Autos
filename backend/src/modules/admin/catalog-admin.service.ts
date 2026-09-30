import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityTarget, ObjectLiteral } from 'typeorm';
import { DomainError, ProblemCode } from '../../domain/domain-error';
import { City } from '../catalog/entities/city.entity';
import { Extra } from '../catalog/entities/extra.entity';
import { Rate } from '../catalog/entities/rate.entity';
import { Supplier } from '../catalog/entities/supplier.entity';
import { VehicleCategory } from '../catalog/entities/vehicle-category.entity';
import { VehicleModel } from '../catalog/entities/vehicle-model.entity';
import { isUuid } from '../orders/uuid';
import {
  CategoryDto, CityDto, ExtraDto, RateDto, SupplierDto, UpdateCategoryDto, UpdateExtraDto, UpdateRateDto, UpdateSupplierDto,
  UpdateVehicleModelDto, VehicleModelDto,
} from './dto/admin.dto';

/**
 * CRUD del catálogo comercial (panel de administración): modelos, categorías, proveedores, extras,
 * tarifas y ciudades. Las reglas que protegen reservas existentes (RN28) están aquí.
 */
@Injectable()
export class CatalogAdminService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  // ── Modelos ───────────────────────────────────────────────────────────────
  async listModels() {
    const models = await this.dataSource.getRepository(VehicleModel).find({
      relations: { category: true, supplier: true }, order: { supplierId: 'ASC', make: 'ASC', model: 'ASC' },
    });
    const counts: { vehicle_model_id: string; units: string }[] = await this.dataSource.query(
      `SELECT vehicle_model_id, count(*) FILTER (WHERE active) AS units FROM fleet_units GROUP BY vehicle_model_id`,
    );
    const unitsByModel = new Map(counts.map((c) => [c.vehicle_model_id, Number(c.units)]));
    return models.map((m) => ({ ...m, units: unitsByModel.get(m.id) ?? 0 }));
  }

  createModel(dto: VehicleModelDto) {
    return this.dataSource.getRepository(VehicleModel).save({ ...dto, active: true });
  }

  async updateModel(id: string, dto: UpdateVehicleModelDto) {
    const model = await this.findOr404(VehicleModel, id, 'El modelo no existe');
    if (dto.active === false && model.active) await this.assertNoFutureReservations('vehicle_model_id', id, 'desactivar el modelo');
    // Un modelo inactivo nunca puede quedar publicado.
    const published = dto.active === false ? false : dto.published;
    await this.dataSource.getRepository(VehicleModel).update(id, { ...dto, ...(published !== undefined ? { published } : {}) });
    return this.dataSource.getRepository(VehicleModel).findOneOrFail({ where: { id }, relations: { category: true, supplier: true } });
  }

  // ── Categorías, proveedores, extras, ciudades ─────────────────────────────
  listCategories() {
    return this.dataSource.getRepository(VehicleCategory).find({ order: { sortOrder: 'ASC' } });
  }

  createCategory(dto: CategoryDto) {
    return this.dataSource.getRepository(VehicleCategory).save(dto);
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    await this.findOr404(VehicleCategory, id, 'La categoría no existe');
    await this.dataSource.getRepository(VehicleCategory).update(id, dto);
    return this.dataSource.getRepository(VehicleCategory).findOneByOrFail({ id });
  }

  listSuppliers() {
    return this.dataSource.getRepository(Supplier).find({ order: { id: 'ASC' } });
  }

  createSupplier(dto: SupplierDto) {
    return this.dataSource.getRepository(Supplier).save(dto);
  }

  async updateSupplier(id: number, dto: UpdateSupplierDto) {
    await this.findOr404(Supplier, id, 'El proveedor no existe');
    await this.dataSource.getRepository(Supplier).update(id, dto);
    return this.dataSource.getRepository(Supplier).findOneByOrFail({ id });
  }

  listExtras() {
    return this.dataSource.getRepository(Extra).find({ order: { type: 'ASC', name: 'ASC' } });
  }

  createExtra(dto: ExtraDto) {
    return this.dataSource.getRepository(Extra).save(dto);
  }

  async updateExtra(id: string, dto: UpdateExtraDto) {
    await this.findOr404(Extra, id, 'El extra no existe');
    await this.dataSource.getRepository(Extra).update(id, dto);
    return this.dataSource.getRepository(Extra).findOneByOrFail({ id });
  }

  listCities() {
    return this.dataSource.getRepository(City).find({ order: { name: 'ASC' } });
  }

  createCity(dto: CityDto) {
    return this.dataSource.getRepository(City).save(dto);
  }

  // ── Tarifas ───────────────────────────────────────────────────────────────
  listRates() {
    return this.dataSource.getRepository(Rate).find({
      relations: { supplier: true, category: true }, order: { supplierId: 'ASC', validFrom: 'DESC' },
    });
  }

  createRate(dto: RateDto) {
    assertValidity(dto.validFrom, dto.validTo);
    // El solapamiento de vigencias lo impide la BD (EXCLUDE rates_no_overlap → 409).
    return this.dataSource.getRepository(Rate).save({ ...dto, currency: 'USD' });
  }

  async updateRate(id: string, dto: UpdateRateDto) {
    const rate = await this.findOr404(Rate, id, 'La tarifa no existe');
    assertValidity(dto.validFrom ?? rate.validFrom, dto.validTo ?? rate.validTo);
    await this.dataSource.getRepository(Rate).update(id, dto);
    return this.dataSource.getRepository(Rate).findOneOrFail({ where: { id }, relations: { supplier: true, category: true } });
  }

  async deleteRate(id: string) {
    await this.findOr404(Rate, id, 'La tarifa no existe');
    await this.dataSource.getRepository(Rate).delete(id);
  }

  // ── helpers ───────────────────────────────────────────────────────────────
  private async findOr404<T extends ObjectLiteral>(entity: EntityTarget<T>, id: string | number, message: string): Promise<T> {
    const valid = typeof id === 'number' ? Number.isInteger(id) : isUuid(id);
    const found = valid ? await this.dataSource.getRepository(entity).findOne({ where: { id } as never }) : null;
    if (!found) throw DomainError.notFound(message);
    return found;
  }

  /** RN28: no se desactiva algo que tiene reservas activas por delante. */
  private async assertNoFutureReservations(column: 'vehicle_model_id' | 'pickup_depot_id', value: string | number, action: string) {
    const [{ count }] = await this.dataSource.query(
      `SELECT count(*)::int AS count FROM reservations
        WHERE ${column} = $1 AND status IN ('PENDING', 'CONFIRMED') AND rental_status <> 'RETURNED' AND dropoff_at > now()`,
      [value],
    );
    if (count > 0) {
      throw new DomainError(ProblemCode.ValidationFailed, 409, 'Conflicto',
        `No se puede ${action}: tiene ${count} reserva(s) activa(s). Despublícalo para que no reciba nuevas reservas.`);
    }
  }
}

function assertValidity(from: string, to: string) {
  if (from > to) {
    throw DomainError.validation('La vigencia termina antes de empezar', [{ name: 'validTo', reason: 'debe ser igual o posterior a validFrom' }]);
  }
}
