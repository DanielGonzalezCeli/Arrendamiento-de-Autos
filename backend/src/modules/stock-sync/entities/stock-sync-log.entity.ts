import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Bitácora de cada PushStockUpdate enviado a Booking y su acuse. */
@Entity('stock_sync_log')
@Index('idx_stock_sync_log_item', ['itemId', 'createdAt'])
export class StockSyncLog {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ type: 'varchar', length: 40 })
  itemId: string;

  /** grpc | http */
  @Column({ type: 'varchar', length: 10 })
  transport: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column()
  success: boolean;

  @Column({ type: 'varchar', length: 60, nullable: true })
  errorCode: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  message: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
