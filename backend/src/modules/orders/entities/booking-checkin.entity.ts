import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/** Outbox del check-in de entrega hacia Booking (contrato v3.1): un aviso por reserva. */
@Entity('booking_checkins')
export class BookingCheckin {
  @PrimaryColumn({ type: 'uuid' })
  reservationId: string;

  @Column({ type: 'varchar', length: 20 })
  locator: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ type: 'varchar', length: 100 })
  correlationId: string;

  @Column({ type: 'varchar', length: 10, default: 'PENDING' })
  status: 'PENDING' | 'SENT';

  @Column({ type: 'integer', default: 0 })
  attempts: number;

  @Column({ type: 'varchar', length: 300, nullable: true })
  lastError: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  acknowledgedStatus: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  sentAt: Date | null;
}
