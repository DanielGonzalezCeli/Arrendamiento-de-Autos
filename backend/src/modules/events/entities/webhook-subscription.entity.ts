import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/** Suscripción a eventos (WebhookSubscription del contrato; el id lo envía el cliente). */
@Entity('webhook_subscriptions')
export class WebhookSubscription {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'varchar', length: 200 })
  ownerSub: string;

  @Column({ type: 'text' })
  url: string;

  @Column({ type: 'text', array: true })
  events: string[];

  /** Secreto HMAC cifrado (AES-256-GCM). Nunca se devuelve por la API. */
  @Column({ type: 'text', nullable: true })
  secretEncrypted: string | null;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
