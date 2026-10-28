import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';
import { ChargeLine, Cleanliness, Damage } from '../../../domain/return-charges';

export enum InspectionKind {
  Pickup = 'PICKUP',
  Return = 'RETURN',
}

/** RN28: estado del auto al entregarlo y al recibirlo, y los cargos que generó la devolución. */
@Entity('rental_inspections')
@Unique(['reservationId', 'kind'])
export class RentalInspection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  reservationId: string;

  @Column({ type: 'varchar', length: 10 })
  kind: InspectionKind;

  @Column({ type: 'uuid', nullable: true })
  fleetUnitId: string | null;

  @Column({ type: 'smallint' })
  fuelEighths: number;

  @Column({ type: 'integer' })
  mileage: number;

  @Column({ type: 'varchar', length: 12, nullable: true })
  cleanliness: Cleanliness | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  damages: Damage[];

  @Column({ type: 'varchar', length: 1000, nullable: true })
  notes: string | null;

  /** Hora real de la entrega o de la devolución. */
  @Column({ type: 'timestamptz' })
  performedAt: Date;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  charges: ChargeLine[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  chargeNotes: string[];

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, transformer: new ColumnNumericTransformer() })
  chargesSubtotal: number;

  @Column({ type: 'uuid', nullable: true })
  invoiceId: string | null;

  /** El kilometraje cruzó el umbral de mantenimiento preventivo: la unidad pasó a taller. */
  @Column({ type: 'boolean', default: false })
  maintenanceDue: boolean;

  @Column({ type: 'varchar', length: 200 })
  createdBy: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
