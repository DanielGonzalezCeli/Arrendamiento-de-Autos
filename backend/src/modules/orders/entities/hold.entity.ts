import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';
import { HoldStatus } from '../../../domain/enums';

/** Bloqueo temporal de una unidad de inventario de un modelo (POST /orders/hold). */
@Entity('holds')
@Index('idx_holds_active', ['vehicleModelId', 'pickupDepotId'], { where: `status = 'HELD'` })
export class Hold {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  searchSessionId: string;

  @Column({ type: 'uuid' })
  vehicleModelId: string;

  @Column()
  pickupDepotId: number;

  @Column()
  dropoffDepotId: number;

  @Column({ type: 'varchar', length: 200 })
  ownerSub: string;

  @Column({ type: 'timestamptz' })
  pickupAt: Date;

  @Column({ type: 'timestamptz' })
  dropoffAt: Date;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: new ColumnNumericTransformer() })
  quotedTotal: number;

  @Column({ type: 'char', length: 3 })
  currency: string;

  @Column({ type: 'enum', enum: HoldStatus, enumName: 'hold_status', default: HoldStatus.Held })
  status: HoldStatus;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
