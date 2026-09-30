import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';
import { PriceBreakdown } from '../../../domain/pricing';

/** Precio congelado antes de confirmar (POST /orders/preview). Su id es order_preview_id. */
@Entity('order_previews')
export class OrderPreview {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  searchSessionId: string;

  @Column({ type: 'uuid', nullable: true })
  holdId: string | null;

  @Column({ type: 'uuid' })
  vehicleModelId: string;

  @Column()
  pickupDepotId: number;

  @Column()
  dropoffDepotId: number;

  @Column({ type: 'varchar', length: 200 })
  ownerSub: string;

  /** Códigos de extras solicitados. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  extras: string[];

  @Column({ type: 'jsonb' })
  breakdown: PriceBreakdown;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: new ColumnNumericTransformer() })
  totalPrice: number;

  @Column({ type: 'char', length: 3 })
  currency: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  consumedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
