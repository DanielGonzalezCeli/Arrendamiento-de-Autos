import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crea identidad.users. Si la BD viene del monolito (public.users existe), la tabla se MUEVE al schema
 * "identidad" en vez de copiarse: conserva ids, hashes de contraseña, índices y restricciones, así que
 * nadie tiene que volver a registrarse ni cambiar su clave.
 *
 * Mientras se despliega, la versión anterior de ms-reservas todavía lee "users": se deja una vista
 * public.users de solo transición, que la migración siguiente de ms-reservas elimina.
 */
export class IdentitySchema1792000000000 implements MigrationInterface {
  name = 'IdentitySchema1792000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const [{ legacy, current }] = await queryRunner.query(`
      SELECT (SELECT relkind FROM pg_class WHERE oid = to_regclass('public.users')) AS legacy,
             to_regclass('identidad.users') IS NOT NULL AS current`);
    if (current) return;

    if (legacy === 'r') {
      await queryRunner.query(`ALTER TABLE public.users SET SCHEMA identidad`);
      await queryRunner.query(`
        DO $$ BEGIN
          IF to_regtype('public.user_role') IS NOT NULL THEN ALTER TYPE public.user_role SET SCHEMA identidad; END IF;
        END $$`);
      await queryRunner.query(`CREATE VIEW public.users AS SELECT * FROM identidad.users`);
      // Una vista no hereda los valores por defecto: sin esto, un registro hecho por la versión anterior fallaría.
      for (const [column, value] of [['id', 'gen_random_uuid()'], ['role', `'CUSTOMER'`], ['active', 'true'], ['created_at', 'now()'], ['updated_at', 'now()']]) {
        await queryRunner.query(`ALTER VIEW public.users ALTER COLUMN ${column} SET DEFAULT ${value}`);
      }
      return;
    }

    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS citext`);
    await queryRunner.query(`CREATE TYPE identidad.user_role AS ENUM ('CUSTOMER', 'ADMIN')`);
    await queryRunner.query(`
      CREATE TABLE identidad.users (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email           citext NOT NULL UNIQUE,
        email_canonical varchar(300) NOT NULL CONSTRAINT users_email_canonical_key UNIQUE,
        password_hash   varchar(100) NOT NULL,
        first_name      varchar(60) NOT NULL,
        last_name       varchar(60) NOT NULL,
        phone           varchar(20),
        role            identidad.user_role NOT NULL DEFAULT 'CUSTOMER',
        active          boolean NOT NULL DEFAULT true,
        created_at      timestamptz NOT NULL DEFAULT now(),
        updated_at      timestamptz NOT NULL DEFAULT now()
      )`);
  }

  /** Devuelve la tabla a public (deshace el movimiento; no borra usuarios). */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP VIEW IF EXISTS public.users`);
    if (await queryRunner.query(`SELECT to_regclass('public.users') IS NULL AS free`).then(([r]) => r.free)) {
      await queryRunner.query(`ALTER TABLE identidad.users SET SCHEMA public`);
      await queryRunner.query(`ALTER TYPE identidad.user_role SET SCHEMA public`);
    }
  }
}
