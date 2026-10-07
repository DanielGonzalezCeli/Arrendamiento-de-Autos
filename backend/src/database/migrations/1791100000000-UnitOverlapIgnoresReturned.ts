import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * La restricción que impide asignar una placa a dos alquileres que se cruzan contaba también los
 * alquileres ya DEVUELTOS. La disponibilidad (AvailabilityService, freeUnits) sí los ignora, porque el
 * auto ya está en la agencia: tras una devolución anticipada la placa aparecía libre, pero la BD
 * rechazaba la entrega. Ahora ambas reglas coinciden. Solo relaja la restricción (no puede fallar).
 */
export class UnitOverlapIgnoresReturned1791100000000 implements MigrationInterface {
  name = 'UnitOverlapIgnoresReturned1791100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE reservations DROP CONSTRAINT reservations_unit_no_overlap`);
    await queryRunner.query(`
      ALTER TABLE reservations ADD CONSTRAINT reservations_unit_no_overlap EXCLUDE USING gist (
        fleet_unit_id WITH =, rental_period WITH &&
      ) WHERE (fleet_unit_id IS NOT NULL AND status IN ('PENDING', 'CONFIRMED') AND rental_status <> 'RETURNED')`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE reservations DROP CONSTRAINT reservations_unit_no_overlap`);
    await queryRunner.query(`
      ALTER TABLE reservations ADD CONSTRAINT reservations_unit_no_overlap EXCLUDE USING gist (
        fleet_unit_id WITH =, rental_period WITH &&
      ) WHERE (fleet_unit_id IS NOT NULL AND status IN ('PENDING', 'CONFIRMED'))`);
  }
}
