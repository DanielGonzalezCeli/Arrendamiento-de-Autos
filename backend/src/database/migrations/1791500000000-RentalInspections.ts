import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * RN28 — inspecciones de entrega/devolución y cargos adicionales:
 *  - vehicle_models.fuel_grade (EXTRA | SUPER | DIESEL) y tank_capacity_l: base del cargo por combustible.
 *  - rental_charge_settings: precios del galón y tarifas (una sola fila, editable en el panel). Precios de
 *    Ecuador del 12/oct al 11/nov de 2026: Extra 3,17 y Diésel 3,11 (regulados); Súper 5,49 (Primax).
 *  - rental_inspections: estado del auto en la entrega y en la devolución (combustible en octavos,
 *    kilometraje, limpieza, daños) y los cargos calculados con la factura que los cobra.
 */
export class RentalInspections1791500000000 implements MigrationInterface {
  name = 'RentalInspections1791500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE vehicle_models ADD COLUMN fuel_grade varchar(10) NOT NULL DEFAULT 'EXTRA' CHECK (fuel_grade IN ('EXTRA', 'SUPER', 'DIESEL'))`);
    await queryRunner.query(`ALTER TABLE vehicle_models ADD COLUMN tank_capacity_l numeric(5,1) NOT NULL DEFAULT 45 CHECK (tank_capacity_l > 0)`);
    await queryRunner.query(`UPDATE vehicle_models SET fuel_grade = 'DIESEL' WHERE fuel_type = 'DIESEL'`);
    // Capacidad de tanque de fábrica de los modelos del catálogo de demostración (litros).
    const tanks: [string, string, number][] = [
      ['Kia', 'Picanto', 35], ['Chevrolet', 'Onix', 44], ['Toyota', 'Corolla Hybrid', 43], ['Kia', 'Sportage', 54],
      ['Toyota', 'Hilux 4x4', 80], ['Hyundai', 'Accent', 43], ['Nissan', 'Sentra', 47], ['Hyundai', 'Tucson', 54],
      ['Toyota', 'Fortuner', 80], ['Hyundai', 'H-1', 75],
    ];
    for (const [make, model, liters] of tanks) {
      await queryRunner.query(`UPDATE vehicle_models SET tank_capacity_l = $3 WHERE make = $1 AND model = $2`, [make, model, liters]);
    }

    await queryRunner.query(`
      CREATE TABLE rental_charge_settings (
        id                   smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        fuel_price_extra     numeric(6,3) NOT NULL DEFAULT 3.17,
        fuel_price_super     numeric(6,3) NOT NULL DEFAULT 5.49,
        fuel_price_diesel    numeric(6,3) NOT NULL DEFAULT 3.11,
        refuel_service_fee   numeric(8,2) NOT NULL DEFAULT 0,
        cleaning_basic       numeric(8,2) NOT NULL DEFAULT 15,
        cleaning_deep        numeric(8,2) NOT NULL DEFAULT 40,
        damage_deductible    numeric(10,2) NOT NULL DEFAULT 800,
        updated_by           varchar(200),
        updated_at           timestamptz NOT NULL DEFAULT now(),
        CHECK (fuel_price_extra > 0 AND fuel_price_super > 0 AND fuel_price_diesel > 0),
        CHECK (refuel_service_fee >= 0 AND cleaning_basic >= 0 AND cleaning_deep >= 0 AND damage_deductible >= 0)
      )`);
    await queryRunner.query(`INSERT INTO rental_charge_settings (id) VALUES (1)`);

    await queryRunner.query(`
      CREATE TABLE rental_inspections (
        id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        reservation_id    uuid NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
        kind              varchar(10) NOT NULL CHECK (kind IN ('PICKUP', 'RETURN')),
        fleet_unit_id     uuid REFERENCES fleet_units(id),
        fuel_eighths      smallint NOT NULL CHECK (fuel_eighths BETWEEN 0 AND 8),
        mileage           integer NOT NULL CHECK (mileage >= 0),
        cleanliness       varchar(12) CHECK (cleanliness IN ('CLEAN', 'DIRTY', 'VERY_DIRTY')),
        damages           jsonb NOT NULL DEFAULT '[]',
        notes             varchar(1000),
        performed_at      timestamptz NOT NULL,
        charges           jsonb NOT NULL DEFAULT '[]',
        charge_notes      jsonb NOT NULL DEFAULT '[]',
        charges_subtotal  numeric(12,2) NOT NULL DEFAULT 0 CHECK (charges_subtotal >= 0),
        invoice_id        uuid REFERENCES invoices(id),
        maintenance_due   boolean NOT NULL DEFAULT false,
        created_by        varchar(200) NOT NULL,
        created_at        timestamptz NOT NULL DEFAULT now(),
        UNIQUE (reservation_id, kind)
      )`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE rental_inspections`);
    await queryRunner.query(`DROP TABLE rental_charge_settings`);
    await queryRunner.query(`ALTER TABLE vehicle_models DROP COLUMN tank_capacity_l`);
    await queryRunner.query(`ALTER TABLE vehicle_models DROP COLUMN fuel_grade`);
  }
}
