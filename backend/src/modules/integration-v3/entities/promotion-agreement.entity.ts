import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';

/** Convenio B2B de promociones con Booking (Cátedra RDA2 §9). Una sola fila (id = 1). */
@Entity('promotion_agreement')
export class PromotionAgreement {
  @PrimaryColumn({ type: 'smallint' })
  id: number;

  @Column({ default: false })
  allowsPromotions: boolean;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0, transformer: new ColumnNumericTransformer() })
  maxDiscountPercent: number;

  @Column({ type: 'text', array: true, default: () => `'{}'` })
  enabledDestinations: string[];

  @Column({ type: 'date', nullable: true })
  validUntil: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  comboConditions: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  updatedBy: string | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
