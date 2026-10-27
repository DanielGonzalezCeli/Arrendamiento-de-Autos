import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reto 2 — integración con Booking Prototipo (contrato autos-openapi-v3.yaml + inventory.proto):
 *  - reservations.partner_data: datos que envía Booking y no tienen columna propia (licencia, vuelo,
 *    cobertura, correlation_id). Solo lo llenan las reservas del canal v3.
 *  - promotion_agreement: convenio B2B de promociones (GET/PUT /autos/promociones/contrato). Una sola fila.
 *  - stock_sync_state: último estado de stock que Booking confirmó por cada auto (gRPC PushStockUpdate).
 *  - stock_sync_log: bitácora de cada envío y su acuse (evidencia y diagnóstico).
 */
export class IntegrationV31791300000000 implements MigrationInterface {
  name = 'IntegrationV31791300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE reservations ADD COLUMN partner_data jsonb`);

    await queryRunner.query(`
      CREATE TABLE promotion_agreement (
        id                           smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        allows_promotions            boolean NOT NULL DEFAULT false,
        max_discount_percent         numeric(5,2) NOT NULL DEFAULT 0 CHECK (max_discount_percent BETWEEN 0 AND 100),
        enabled_destinations         text[] NOT NULL DEFAULT '{}',
        valid_until                  date,
        combo_conditions             varchar(500),
        updated_by                   varchar(200),
        updated_at                   timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(`INSERT INTO promotion_agreement (id) VALUES (1)`);

    await queryRunner.query(`
      CREATE TABLE stock_sync_state (
        item_id            varchar(40) PRIMARY KEY,
        synced_units       smallint,
        synced_date        char(10),
        synced_time_slot   char(5),
        last_timestamp     bigint NOT NULL DEFAULT 0,
        last_success       boolean,
        last_error_code    varchar(60),
        last_message       varchar(300),
        attempts           integer NOT NULL DEFAULT 0,
        synced_at          timestamptz,
        updated_at         timestamptz NOT NULL DEFAULT now()
      )`);

    await queryRunner.query(`
      CREATE TABLE stock_sync_log (
        id           bigserial PRIMARY KEY,
        item_id      varchar(40) NOT NULL,
        transport    varchar(10) NOT NULL,
        payload      jsonb NOT NULL,
        success      boolean NOT NULL,
        error_code   varchar(60),
        message      varchar(300),
        created_at   timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(`CREATE INDEX idx_stock_sync_log_item ON stock_sync_log (item_id, created_at DESC)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE stock_sync_log`);
    await queryRunner.query(`DROP TABLE stock_sync_state`);
    await queryRunner.query(`DROP TABLE promotion_agreement`);
    await queryRunner.query(`ALTER TABLE reservations DROP COLUMN partner_data`);
  }
}
