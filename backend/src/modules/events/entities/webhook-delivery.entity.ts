import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { DeliveryStatus } from '../../../domain/enums';

/** Intento(s) de entrega de un evento a una suscripción, con reintentos. */
@Entity('webhook_deliveries')
@Unique(['eventId', 'subscriptionId'])
@Index('idx_webhook_deliveries_due', ['status', 'nextAttemptAt'])
export class WebhookDelivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  eventId: string;

  @Column({ type: 'uuid' })
  subscriptionId: string;

  @Column({ type: 'smallint', default: 0 })
  attempt: number;

  @Column({ type: 'enum', enum: DeliveryStatus, enumName: 'delivery_status', default: DeliveryStatus.Pending })
  status: DeliveryStatus;

  @Column({ type: 'smallint', nullable: true })
  responseCode: number | null;

  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  nextAttemptAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deliveredAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
