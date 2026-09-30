import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { OrderChannel } from '../../../domain/enums';

/** Resultado cotizado de un modelo dentro de una búsqueda. */
export interface QuotedResult {
  vehicleModelId: string;
  supplierId: number;
  pickupDepotId: number;
  dropoffDepotId: number;
  totalPrice: number;
}

/**
 * Contexto de una búsqueda. Su id es el search_token del contrato: hold y preview solo envían
 * vehicle_id + search_token, así que las fechas, agencias, edad y moneda se recuperan de aquí.
 */
@Entity('search_sessions')
export class SearchSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: OrderChannel, enumName: 'order_channel' })
  channel: OrderChannel;

  @Column({ type: 'varchar', length: 200, nullable: true })
  ownerSub: string | null;

  @Column({ type: 'integer', nullable: true })
  affiliateId: number | null;

  @Column({ type: 'timestamptz' })
  pickupAt: Date;

  @Column({ type: 'timestamptz' })
  dropoffAt: Date;

  @Column({ type: 'integer', array: true })
  pickupDepotIds: number[];

  @Column({ type: 'integer', array: true })
  dropoffDepotIds: number[];

  @Column({ type: 'smallint' })
  driverAge: number;

  @Column({ type: 'char', length: 2 })
  bookerCountry: string;

  @Column({ type: 'char', length: 3 })
  currency: string;

  @Column({ type: 'jsonb' })
  request: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  results: QuotedResult[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;
}
