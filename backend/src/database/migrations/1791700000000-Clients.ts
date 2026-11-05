import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Contrato v3.1 — clientes cross-platform: el conductor que Booking registra existe una sola vez en RutaLibre.
 *  - clients: identificación (cédula, RUC o pasaporte) y correo canónico únicos; así ni Booking ni el mostrador
 *    pueden duplicar a una persona.
 *  - reservations.client_id: a qué cliente pertenece cada reserva (las de Booking se vinculan al crearse).
 */
export class Clients1791700000000 implements MigrationInterface {
  name = 'Clients1791700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE clients (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        full_name varchar(120) NOT NULL,
        email varchar(120) NOT NULL,
        email_canonical varchar(120) NOT NULL UNIQUE,
        identification varchar(20) NOT NULL UNIQUE,
        phone varchar(30),
        license_number varchar(40),
        source varchar(20) NOT NULL CHECK (source IN ('BOOKING', 'WEB', 'MOSTRADOR')),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(`ALTER TABLE reservations ADD COLUMN client_id uuid REFERENCES clients(id) ON DELETE SET NULL`);
    await queryRunner.query(`CREATE INDEX idx_reservations_client ON reservations (client_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX idx_reservations_client`);
    await queryRunner.query(`ALTER TABLE reservations DROP COLUMN client_id`);
    await queryRunner.query(`DROP TABLE clients`);
  }
}
