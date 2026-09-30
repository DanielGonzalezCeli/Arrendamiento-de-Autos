import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum ReservationAction {
  Created = 'CREATED',
  Modified = 'MODIFIED',
  Cancelled = 'CANCELLED',
  PickedUp = 'PICKED_UP',
  Returned = 'RETURNED',
}

/** Auditoría de cambios de una reserva. */
@Entity('reservation_history')
@Index('idx_reservation_history_reservation', ['reservationId'])
export class ReservationHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  reservationId: string;

  @Column({ type: 'varchar', length: 30 })
  action: ReservationAction;

  @Column({ type: 'varchar', length: 200 })
  actorSub: string;

  @Column({ type: 'jsonb', nullable: true })
  before: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  after: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
