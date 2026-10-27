import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** Último estado de stock que Booking confirmó para cada auto (item_id del inventory.proto). */
@Entity('stock_sync_state')
export class StockSyncState {
  @PrimaryColumn({ type: 'varchar', length: 40 })
  itemId: string;

  /** available_units confirmado (null = nunca se envió con éxito). */
  @Column({ type: 'smallint', nullable: true })
  syncedUnits: number | null;

  @Column({ type: 'char', length: 10, nullable: true })
  syncedDate: string | null;

  @Column({ type: 'char', length: 5, nullable: true })
  syncedTimeSlot: string | null;

  /** Último timestamp enviado: Booking descarta los menores (STALE_TIMESTAMP_IGNORED). */
  @Column({ type: 'bigint', default: 0 })
  lastTimestamp: string;

  @Column({ type: 'boolean', nullable: true })
  lastSuccess: boolean | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  lastErrorCode: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  lastMessage: string | null;

  @Column({ type: 'integer', default: 0 })
  attempts: number;

  @Column({ type: 'timestamptz', nullable: true })
  syncedAt: Date | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
