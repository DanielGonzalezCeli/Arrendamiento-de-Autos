import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';
import { BuyerIdType, SriDocType } from '../../../domain/sri';

export interface InvoiceLine {
  code: string;
  description: string;
  quantity: number;
  unitPrice: number;
  /** Precio total sin impuestos de la línea. */
  subtotal: number;
  vat: number;
}

/** Factura (01) o nota de crédito (04) de una reserva — RN27. */
@Entity('invoices')
@Index('idx_invoices_reservation', ['reservationId', 'issuedAt'])
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  reservationId: string;

  @Column({ type: 'char', length: 2 })
  docType: SriDocType;

  /** 001-001-000000123 */
  @Column({ type: 'varchar', length: 17 })
  number: string;

  @Column({ type: 'char', length: 49, unique: true })
  accessKey: string;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  issuedAt: Date;

  @Column({ type: 'varchar', length: 300 })
  reason: string;

  /** Nota de crédito: factura que modifica. */
  @Column({ type: 'uuid', nullable: true })
  relatedInvoiceId: string | null;

  @Column({ type: 'char', length: 2 })
  buyerIdType: BuyerIdType;

  @Column({ type: 'varchar', length: 20 })
  buyerId: string;

  @Column({ type: 'varchar', length: 300 })
  buyerName: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  buyerAddress: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  buyerEmail: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: new ColumnNumericTransformer() })
  subtotal: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: new ColumnNumericTransformer() })
  vat: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: new ColumnNumericTransformer() })
  total: number;

  @Column({ type: 'char', length: 3 })
  currency: string;

  @Column({ type: 'jsonb' })
  lines: InvoiceLine[];

  @Column({ type: 'text', select: false })
  xml: string;
}
