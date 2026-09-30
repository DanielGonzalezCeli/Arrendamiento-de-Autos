import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { UnitStatus } from '../../../domain/enums';
import { Depot } from './depot.entity';
import { VehicleModel } from './vehicle-model.entity';

/** Unidad física (placa) de un modelo, ubicada en una agencia. Es el inventario real. */
@Entity('fleet_units')
@Index('idx_fleet_units_model_depot', ['vehicleModelId', 'depotId'])
export class FleetUnit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  vehicleModelId: string;

  @ManyToOne(() => VehicleModel)
  @JoinColumn({ name: 'vehicle_model_id' })
  vehicleModel: VehicleModel;

  @Column()
  depotId: number;

  @ManyToOne(() => Depot)
  @JoinColumn({ name: 'depot_id' })
  depot: Depot;

  @Column({ type: 'varchar', length: 10, unique: true })
  plate: string;

  @Column({ type: 'smallint' })
  year: number;

  @Column({ type: 'varchar', length: 30, nullable: true })
  color: string | null;

  @Column({ type: 'integer', default: 0 })
  mileage: number;

  @Column({ type: 'enum', enum: UnitStatus, enumName: 'unit_status', default: UnitStatus.Available })
  status: UnitStatus;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
