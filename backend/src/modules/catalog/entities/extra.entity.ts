import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';
import { ExtraType } from '../../../domain/enums';

/** Equipamiento, cobertura o servicio adicional (OrderPreviewRequest.extras usa su code). */
@Entity('extras')
export class Extra {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 30, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: ExtraType, enumName: 'extra_type' })
  type: ExtraType;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: new ColumnNumericTransformer() })
  pricePerDay: number;

  /** Tope por alquiler (null = sin tope). */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true, transformer: new ColumnNumericTransformer() })
  maxPrice: number | null;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
