import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Correo canónico de los usuarios: en Gmail los puntos no cuentan, "+etiqueta" se ignora y googlemail.com
 * es gmail.com. Con un índice único se evita registrar varias cuentas para el mismo buzón
 * (daniel@gmail.com, dan.iel@gmail.com, daniel+test@gmail.com).
 *
 * Si ya existieran cuentas que comparten buzón, se conserva la más antigua con el canónico "limpio" y a las
 * demás se les agrega un sufijo con su id: ninguna cuenta se borra y el índice único se puede crear.
 */
export class UserEmailCanonical1791200000000 implements MigrationInterface {
  name = 'UserEmailCanonical1791200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users ADD COLUMN email_canonical varchar(300)`);
    await queryRunner.query(`
      UPDATE users SET email_canonical = CASE
        WHEN lower(split_part(email, '@', 2)) IN ('gmail.com', 'googlemail.com')
          THEN replace(split_part(split_part(lower(email), '@', 1), '+', 1), '.', '') || '@gmail.com'
        ELSE lower(email)
      END`);
    await queryRunner.query(`
      UPDATE users u SET email_canonical = u.email_canonical || '#' || u.id
        FROM (SELECT id, row_number() OVER (PARTITION BY email_canonical ORDER BY created_at, id) AS rn FROM users) d
       WHERE d.id = u.id AND d.rn > 1`);
    await queryRunner.query(`ALTER TABLE users ALTER COLUMN email_canonical SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE users ADD CONSTRAINT users_email_canonical_key UNIQUE (email_canonical)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users DROP CONSTRAINT users_email_canonical_key`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN email_canonical`);
  }
}
