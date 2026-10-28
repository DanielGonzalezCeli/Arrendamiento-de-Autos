import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';

const money = { type: 'numeric' as const, precision: 10, scale: 2, transformer: new ColumnNumericTransformer() };
const fuel = { type: 'numeric' as const, precision: 6, scale: 3, transformer: new ColumnNumericTransformer() };

/** RN28: precios del galón y tarifas de los cargos de devolución (una sola fila, id = 1). */
@Entity('rental_charge_settings')
export class RentalChargeSettings {
  @PrimaryColumn({ type: 'smallint', default: 1 })
  id: number;

  @Column(fuel) fuelPriceExtra: number;
  @Column(fuel) fuelPriceSuper: number;
  @Column(fuel) fuelPriceDiesel: number;
  @Column(money) refuelServiceFee: number;
  @Column(money) cleaningBasic: number;
  @Column(money) cleaningDeep: number;
  @Column(money) damageDeductible: number;

  @Column({ type: 'varchar', length: 200, nullable: true })
  updatedBy: string | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
