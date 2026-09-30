import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';

/** Tasa de conversión desde USD (moneda base). USD = 1. */
@Entity('currency_rates')
export class CurrencyRate {
  @PrimaryColumn({ type: 'char', length: 3 })
  currency: string;

  @Column({ type: 'numeric', precision: 14, scale: 6, transformer: new ColumnNumericTransformer() })
  rateFromUsd: number;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
