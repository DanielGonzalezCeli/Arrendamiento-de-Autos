import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Categoría comercial (filters.car_types del contrato usa su code). */
@Entity('vehicle_categories')
export class VehicleCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 60 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Edad mínima del conductor (DRIVER_AGE_RESTRICTION). */
  @Column({ type: 'smallint' })
  minDriverAge: number;

  @Column({ type: 'smallint', default: 0 })
  sortOrder: number;
}
