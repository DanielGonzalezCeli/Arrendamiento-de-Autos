import { MigrationInterface, QueryRunner } from 'typeorm';

/** Columnas de ms-reservas que guardan el id de un usuario de ms-identidad. */
const USER_REFERENCES = [
  ['reservations', 'user_id'],
  ['depot_reviews', 'user_id'],
  ['vehicle_blocks', 'created_by'],
  ['media_images', 'uploaded_by'],
] as const;

/**
 * Fase B (microservicios): los usuarios pasan a ms-identidad, que mueve la tabla a su schema "identidad".
 * Entre servicios no hay claves foráneas: estas columnas quedan como referencias lógicas (el id del usuario).
 * Elimina también la vista public.users que ms-identidad deja para la versión anterior de este servicio.
 *
 * En una BD nueva (CI) public.users sigue siendo la tabla creada por InitialSchema: no se toca, porque
 * ms-identidad la reclama al migrar.
 */
export class UsersToIdentityService1792000000000 implements MigrationInterface {
  name = 'UsersToIdentityService1792000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const [table, column] of USER_REFERENCES) {
      const constraints: { name: string }[] = await queryRunner.query(`
        SELECT c.conname AS name
          FROM pg_constraint c
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
         WHERE c.contype = 'f' AND c.conrelid = to_regclass($1) AND a.attname = $2`, [`public.${table}`, column]);
      for (const { name } of constraints) await queryRunner.query(`ALTER TABLE public.${table} DROP CONSTRAINT "${name}"`);
    }
    await queryRunner.query(`
      DO $$ BEGIN
        IF (SELECT relkind FROM pg_class WHERE oid = to_regclass('public.users')) = 'v' THEN DROP VIEW public.users; END IF;
      END $$`);
  }

  /** No se restauran las claves foráneas: la tabla de usuarios ya no pertenece a este servicio. */
  async down(): Promise<void> {}
}
