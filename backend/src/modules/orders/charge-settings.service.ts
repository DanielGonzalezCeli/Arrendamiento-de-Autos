import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ChargeSettings } from '../../domain/return-charges';
import { RentalChargeSettings } from './entities/rental-charge-settings.entity';

export type ChargeSettingsUpdate = Partial<Omit<RentalChargeSettings, 'id' | 'updatedBy' | 'updatedAt'>>;

/** RN28: tarifas de cargos de devolución editables en el panel (los precios del combustible cambian cada mes). */
@Injectable()
export class ChargeSettingsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async get(manager: EntityManager = this.dataSource.manager): Promise<RentalChargeSettings> {
    return manager.findOneByOrFail(RentalChargeSettings, { id: 1 });
  }

  async update(changes: ChargeSettingsUpdate, actorSub: string): Promise<RentalChargeSettings> {
    await this.dataSource.getRepository(RentalChargeSettings).update(1, { ...changes, updatedBy: actorSub });
    return this.get();
  }

  /** Forma que usa el cálculo de dominio. */
  static toDomain(s: RentalChargeSettings): ChargeSettings {
    return {
      fuelPrices: { EXTRA: s.fuelPriceExtra, SUPER: s.fuelPriceSuper, DIESEL: s.fuelPriceDiesel },
      refuelServiceFee: s.refuelServiceFee,
      cleaningBasic: s.cleaningBasic,
      cleaningDeep: s.cleaningDeep,
      damageDeductible: s.damageDeductible,
    };
  }
}
