import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crea clientes.clients. Si la BD viene del monolito (public.clients existe), la tabla se MUEVE al schema
 * "clientes": conserva los client_id que Booking ya guardó, índices y restricciones.
 *
 * Mientras se despliega, la versión anterior de ms-reservas todavía usa "clients": se deja una vista
 * public.clients de solo transición (con los valores por defecto), que la migración siguiente de ms-reservas elimina.
 */
export class ClientsSchema1792100000000 implements MigrationInterface {
  name = 'ClientsSchema1792100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const [{ legacy, current }] = await queryRunner.query(`
      SELECT (SELECT relkind FROM pg_class WHERE oid = to_regclass('public.clients')) AS legacy,
             to_regclass('clientes.clients') IS NOT NULL AS current`);
    if (current) return;

    if (legacy === 'r') {
      await queryRunner.query(`ALTER TABLE public.clients SET SCHEMA clientes`);
      await queryRunner.query(`CREATE VIEW public.clients AS SELECT * FROM clientes.clients`);
      for (const [column, value] of [['id', 'gen_random_uuid()'], ['created_at', 'now()'], ['updated_at', 'now()']]) {
        await queryRunner.query(`ALTER VIEW public.clients ALTER COLUMN ${column} SET DEFAULT ${value}`);
      }
      return;
    }

    await queryRunner.query(`
      CREATE TABLE clientes.clients (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        full_name       varchar(120) NOT NULL,
        email           varchar(120) NOT NULL,
        email_canonical varchar(120) NOT NULL UNIQUE,
        identification  varchar(20) NOT NULL UNIQUE,
        phone           varchar(30),
        license_number  varchar(40),
        source          varchar(20) NOT NULL CHECK (source IN ('BOOKING', 'WEB', 'MOSTRADOR')),
        created_at      timestamptz NOT NULL DEFAULT now(),
        updated_at      timestamptz NOT NULL DEFAULT now()
      )`);
  }

  /** Devuelve la tabla a public (deshace el movimiento; no borra clientes). */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP VIEW IF EXISTS public.clients`);
    if (await queryRunner.query(`SELECT to_regclass('public.clients') IS NULL AS free`).then(([r]) => r.free)) {
      await queryRunner.query(`ALTER TABLE clientes.clients SET SCHEMA public`);
    }
  }
}
