import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Calificación 1–10 de una agencia tras una reserva devuelta. Alimenta /depots/reviews/scores. */
@Entity('depot_reviews')
@Index('idx_depot_reviews_depot', ['depotId'])
export class DepotReview {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  depotId: number;

  @Column({ type: 'uuid', nullable: true, unique: true })
  reservationId: string | null;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ type: 'smallint' })
  score: number;

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
