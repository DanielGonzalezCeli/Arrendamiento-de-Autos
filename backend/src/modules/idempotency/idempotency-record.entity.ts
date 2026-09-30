import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';
import { IdempotencyStatus } from '../../domain/enums';

/** Registro de Idempotency-Key: permite reproducir la respuesta original ante reintentos. */
@Entity('idempotency_records')
@Index('idx_idempotency_expires', ['expiresAt'])
export class IdempotencyRecord {
  @PrimaryColumn({ type: 'varchar', length: 200 })
  ownerSub: string;

  @PrimaryColumn({ type: 'uuid' })
  idempotencyKey: string;

  @PrimaryColumn({ type: 'varchar', length: 60 })
  operation: string;

  /** SHA-256 del método + ruta + body canónico. */
  @Column({ type: 'char', length: 64 })
  requestHash: string;

  @Column({ type: 'enum', enum: IdempotencyStatus, enumName: 'idempotency_status' })
  status: IdempotencyStatus;

  @Column({ type: 'smallint', nullable: true })
  responseStatus: number | null;

  @Column({ type: 'jsonb', nullable: true })
  responseBody: unknown;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;
}
