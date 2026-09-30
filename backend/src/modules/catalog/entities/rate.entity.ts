import {
  Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';
import { Supplier } from './supplier.entity';
import { VehicleCategory } from './vehicle-category.entity';

/** Tarifa diaria por proveedor y categoría, con vigencia. La BD impide vigencias solapadas (rates_no_overlap). */
@Entity('rates')
export class Rate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  supplierId: number;

  @ManyToOne(() => Supplier)
  @JoinColumn({ name: 'supplier_id' })
  supplier: Supplier;

  @Column({ type: 'uuid' })
  categoryId: string;

  @ManyToOne(() => VehicleCategory)
  @JoinColumn({ name: 'category_id' })
  category: VehicleCategory;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: new ColumnNumericTransformer() })
  dailyRate: number;

  @Column({ type: 'char', length: 3, default: 'USD' })
  currency: string;

  /** Formato YYYY-MM-DD (inclusive). */
  @Column({ type: 'date' })
  validFrom: string;

  @Column({ type: 'date' })
  validTo: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
