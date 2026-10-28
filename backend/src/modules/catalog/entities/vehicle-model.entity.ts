import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { FuelPolicy, FuelType, Transmission } from '../../../domain/enums';
import { Supplier } from './supplier.entity';
import { VehicleCategory } from './vehicle-category.entity';
import { FuelGrade } from '../../../domain/return-charges';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';

/**
 * Modelo comercial "o similar". Su id es el vehicle_id del contrato (confirmado por el equipo de integración):
 * el cliente reserva un modelo; la unidad física (placa) se asigna en la entrega.
 */
@Entity('vehicle_models')
@Index('idx_vehicle_models_supplier_category', ['supplierId', 'categoryId'])
@Index('idx_vehicle_models_updated', ['updatedAt'])
export class VehicleModel {
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

  @Column({ type: 'varchar', length: 50 })
  make: string;

  @Column({ type: 'varchar', length: 60 })
  model: string;

  @Column({ type: 'char', length: 4, nullable: true })
  acrissCode: string | null;

  @Column({ type: 'enum', enum: Transmission, enumName: 'transmission' })
  transmission: Transmission;

  @Column({ type: 'enum', enum: FuelType, enumName: 'fuel_type' })
  fuelType: FuelType;

  @Column({ type: 'enum', enum: FuelPolicy, enumName: 'fuel_policy', default: FuelPolicy.FullToFull })
  fuelPolicy: FuelPolicy;

  /** RN28: combustible que usa (Extra, Súper o Diésel): define el precio del galón en los cargos de devolución. */
  @Column({ type: 'varchar', length: 10, default: FuelGrade.Extra })
  fuelGrade: FuelGrade;

  /** RN28: capacidad de la batería (kWh) de los eléctricos; null en motores de combustión. */
  @Column({ type: 'numeric', precision: 5, scale: 1, nullable: true, transformer: new ColumnNumericTransformer() })
  batteryKwh: number | null;

  /** RN28: capacidad del tanque en litros. */
  @Column({ type: 'numeric', precision: 5, scale: 1, default: 45, transformer: new ColumnNumericTransformer() })
  tankCapacityL: number;

  @Column({ type: 'smallint' })
  seats: number;

  @Column({ type: 'smallint' })
  doors: number;

  @Column({ type: 'smallint' })
  bagCapacity: number;

  @Column({ default: true })
  airConditioning: boolean;

  @Column({ type: 'text', nullable: true })
  imageUrl: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Solo los modelos publicados aparecen en el marketplace y en /search. */
  @Column({ default: false })
  published: boolean;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
