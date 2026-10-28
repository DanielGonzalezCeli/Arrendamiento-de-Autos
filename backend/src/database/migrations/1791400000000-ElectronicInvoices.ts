import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * RN27 — comprobantes electrónicos (formato SRI, ambiente de pruebas):
 *  - invoices: facturas (01) y notas de crédito (04) ligadas a una reserva. Guardan el comprador, los
 *    totales, las líneas y el XML generado; la clave de acceso es única.
 *  - invoice_sequences: secuencial por tipo de documento y serie (establecimiento + punto de emisión).
 *    Se reserva con SELECT … FOR UPDATE dentro de la transacción de la reserva: sin huecos ni duplicados.
 */
export class ElectronicInvoices1791400000000 implements MigrationInterface {
  name = 'ElectronicInvoices1791400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE invoice_sequences (
        doc_type        char(2) NOT NULL,
        establishment   char(3) NOT NULL,
        emission_point  char(3) NOT NULL,
        last_value      integer NOT NULL DEFAULT 0,
        PRIMARY KEY (doc_type, establishment, emission_point)
      )`);

    await queryRunner.query(`
      CREATE TABLE invoices (
        id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        reservation_id       uuid NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
        doc_type             char(2) NOT NULL CHECK (doc_type IN ('01', '04')),
        number               varchar(17) NOT NULL,
        access_key           char(49) NOT NULL UNIQUE,
        issued_at            timestamptz NOT NULL DEFAULT now(),
        reason               varchar(300) NOT NULL,
        related_invoice_id   uuid REFERENCES invoices(id),
        buyer_id_type        char(2) NOT NULL,
        buyer_id             varchar(20) NOT NULL,
        buyer_name           varchar(300) NOT NULL,
        buyer_address        varchar(300),
        buyer_email          varchar(120),
        subtotal             numeric(12,2) NOT NULL CHECK (subtotal >= 0),
        vat                  numeric(12,2) NOT NULL CHECK (vat >= 0),
        total                numeric(12,2) NOT NULL CHECK (total >= 0),
        currency             char(3) NOT NULL,
        lines                jsonb NOT NULL,
        xml                  text NOT NULL,
        UNIQUE (doc_type, number)
      )`);
    await queryRunner.query(`CREATE INDEX idx_invoices_reservation ON invoices (reservation_id, issued_at)`);
    await queryRunner.query(`CREATE INDEX idx_invoices_issued ON invoices (issued_at DESC)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE invoices`);
    await queryRunner.query(`DROP TABLE invoice_sequences`);
  }
}
