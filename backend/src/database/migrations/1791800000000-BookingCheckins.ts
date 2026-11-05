import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Contrato v3.1 — check-in de entrega: cuando el mostrador entrega las llaves de una reserva de Booking, se
 * avisa a Booking (POST /reservas/{external_order_id}/checkin). Patrón Outbox: el aviso se guarda en la misma
 * transacción que la entrega y un despachador lo envía y reintenta hasta que Booking lo confirme.
 */
export class BookingCheckins1791800000000 implements MigrationInterface {
  name = 'BookingCheckins1791800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE booking_checkins (
        reservation_id uuid PRIMARY KEY REFERENCES reservations(id) ON DELETE CASCADE,
        locator varchar(20) NOT NULL,
        payload jsonb NOT NULL,
        correlation_id varchar(100) NOT NULL,
        status varchar(10) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT')),
        attempts integer NOT NULL DEFAULT 0,
        last_error varchar(300),
        acknowledged_status varchar(40),
        created_at timestamptz NOT NULL DEFAULT now(),
        sent_at timestamptz
      )`);
    await queryRunner.query(`CREATE INDEX idx_booking_checkins_pending ON booking_checkins (created_at) WHERE status = 'PENDING'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE booking_checkins`);
  }
}
