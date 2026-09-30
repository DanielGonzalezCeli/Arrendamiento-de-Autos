import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Evento de dominio guardado en la misma transacción que el cambio (patrón Transactional Outbox). */
@Entity('outbox_events')
export class OutboxEvent {
  /** eventId del WebhookPayload. */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 60 })
  eventType: string;

  @Column({ type: 'varchar', length: 100 })
  resourceId: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  occurredAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  dispatchedAt: Date | null;
}
