import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Último secuencial emitido por tipo de documento y serie (se bloquea con FOR UPDATE al emitir). */
@Entity('invoice_sequences')
export class InvoiceSequence {
  @PrimaryColumn({ type: 'char', length: 2 })
  docType: string;

  @PrimaryColumn({ type: 'char', length: 3 })
  establishment: string;

  @PrimaryColumn({ type: 'char', length: 3 })
  emissionPoint: string;

  @Column({ type: 'integer', default: 0 })
  lastValue: number;
}
