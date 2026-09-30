import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/** Cliente B2B (ej. Booking Hub) para el emisor OAuth2 local de RDA1 (grant client_credentials). */
@Entity('api_clients')
export class ApiClient {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  clientId: string;

  @Column({ type: 'varchar', length: 100 })
  clientSecretHash: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  /** Scopes permitidos: autos:read, autos:book, autos:cancel, autos:webhooks. */
  @Column({ type: 'text', array: true, default: () => "'{}'" })
  scopes: string[];

  @Column({ type: 'integer', nullable: true })
  affiliateId: number | null;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
