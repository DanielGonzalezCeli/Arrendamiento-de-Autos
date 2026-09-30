import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Teléfonos de agencias en formato internacional E.164 (+593…), igual que usuarios y reservas:
 * el panel de administración los valida con la misma regla (IsInternationalPhone).
 */
export class DepotPhonesE1641790900000000 implements MigrationInterface {
  name = 'DepotPhonesE1641790900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE depots SET phone = '+593' || substring(phone FROM 2) WHERE phone ~ '^0[2-9][0-9]{7,8}$'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE depots SET phone = '0' || substring(phone FROM 5) WHERE phone ~ '^\+593[2-9][0-9]{7,8}$'`);
  }
}
