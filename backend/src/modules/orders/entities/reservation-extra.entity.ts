import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';
import { Reservation } from './reservation.entity';

/** Snapshot de un extra vendido (precio histórico). */
@Entity('reservation_extras')
export class ReservationExtra {
  @PrimaryColumn({ type: 'uuid' })
  reservationId: string;

  @PrimaryColumn({ type: 'uuid' })
  extraId: string;

  @ManyToOne(() => Reservation, (reservation) => reservation.extras, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reservation_id' })
  reservation: Reservation;

  @Column({ type: 'varchar', length: 30 })
  code: string;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: new ColumnNumericTransformer() })
  unitPrice: number;

  @Column({ type: 'smallint' })
  days: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: new ColumnNumericTransformer() })
  subtotal: number;
}
