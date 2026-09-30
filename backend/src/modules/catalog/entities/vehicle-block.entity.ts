import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { FleetUnit } from './fleet-unit.entity';

/** Bloqueo de disponibilidad de una unidad (mantenimiento, reparación…). */
@Entity('vehicle_blocks')
export class VehicleBlock {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  fleetUnitId: string;

  @ManyToOne(() => FleetUnit, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fleet_unit_id' })
  fleetUnit: FleetUnit;

  @Column({ type: 'timestamptz' })
  startsAt: Date;

  @Column({ type: 'timestamptz' })
  endsAt: Date;

  @Column({ type: 'varchar', length: 200 })
  reason: string;

  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
