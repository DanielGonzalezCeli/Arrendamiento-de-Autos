import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * RN28 — vehículos eléctricos: no usan gasolina, así que la carga faltante se cobra en kWh.
 *  - vehicle_models.fuel_grade admite ELECTRIC y se agrega battery_kwh (capacidad útil de la batería).
 *    Un modelo ELECTRIC siempre tiene batería; los modelos con fuel_type = ELECTRIC creados antes de esta
 *    migración (p. ej. el BYD Yuan Pro cargado desde el panel) quedaban como "Extra, 45 L" y se corrigen.
 *  - rental_charge_settings.electricity_price_kwh: referencia de carga rápida en electrolinera (Ecuador,
 *    ~0,24–0,29 USD/kWh); editable en el panel.
 */
export class ElectricVehicles1791600000000 implements MigrationInterface {
  name = 'ElectricVehicles1791600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE vehicle_models DROP CONSTRAINT IF EXISTS vehicle_models_fuel_grade_check`);
    await queryRunner.query(`ALTER TABLE vehicle_models ADD CONSTRAINT vehicle_models_fuel_grade_check CHECK (fuel_grade IN ('EXTRA', 'SUPER', 'DIESEL', 'ELECTRIC'))`);
    await queryRunner.query(`ALTER TABLE vehicle_models ADD COLUMN battery_kwh numeric(5,1) CHECK (battery_kwh > 0)`);
    // BYD Yuan Pro (100 % eléctrico): batería Blade LFP de 43,2 kWh según el comparador ecuatoriano; 50 kWh si el modelo no se conoce.
    await queryRunner.query(`
      UPDATE vehicle_models
         SET fuel_grade = 'ELECTRIC',
             battery_kwh = CASE WHEN lower(make) = 'byd' AND lower(model) LIKE 'yuan pro%' THEN 43.2 ELSE 50 END
       WHERE fuel_type = 'ELECTRIC'`);
    await queryRunner.query(`ALTER TABLE vehicle_models ADD CONSTRAINT vehicle_models_electric_battery_check
      CHECK ((fuel_grade = 'ELECTRIC') = (battery_kwh IS NOT NULL))`);

    await queryRunner.query(`ALTER TABLE rental_charge_settings ADD COLUMN electricity_price_kwh numeric(6,3) NOT NULL DEFAULT 0.25 CHECK (electricity_price_kwh > 0)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE rental_charge_settings DROP COLUMN electricity_price_kwh`);
    await queryRunner.query(`ALTER TABLE vehicle_models DROP CONSTRAINT vehicle_models_electric_battery_check`);
    await queryRunner.query(`UPDATE vehicle_models SET fuel_grade = 'EXTRA' WHERE fuel_grade = 'ELECTRIC'`);
    await queryRunner.query(`ALTER TABLE vehicle_models DROP COLUMN battery_kwh`);
    await queryRunner.query(`ALTER TABLE vehicle_models DROP CONSTRAINT vehicle_models_fuel_grade_check`);
    await queryRunner.query(`ALTER TABLE vehicle_models ADD CONSTRAINT vehicle_models_fuel_grade_check CHECK (fuel_grade IN ('EXTRA', 'SUPER', 'DIESEL'))`);
  }
}
