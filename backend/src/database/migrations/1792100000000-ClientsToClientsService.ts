import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase C (microservicios): los clientes pasan a ms-clientes, que mueve la tabla a su schema "clientes".
 * reservations.client_id queda como referencia lógica (sin clave foránea entre servicios).
 * Elimina también la vista public.clients que ms-clientes deja para la versión anterior de este servicio.
 *
 * En una BD nueva (CI) public.clients sigue siendo la tabla creada por la migración Clients: no se toca,
 * porque ms-clientes la reclama al migrar.
 */
export class ClientsToClientsService1792100000000 implements MigrationInterface {
  name = 'ClientsToClientsService1792100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const constraints: { name: string }[] = await queryRunner.query(`
      SELECT c.conname AS name
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
       WHERE c.contype = 'f' AND c.conrelid = 'public.reservations'::regclass AND a.attname = 'client_id'`);
    for (const { name } of constraints) await queryRunner.query(`ALTER TABLE public.reservations DROP CONSTRAINT "${name}"`);
    await queryRunner.query(`
      DO $$ BEGIN
        IF (SELECT relkind FROM pg_class WHERE oid = to_regclass('public.clients')) = 'v' THEN DROP VIEW public.clients; END IF;
      END $$`);
  }

  /** No se restaura la clave foránea: la tabla de clientes ya no pertenece a este servicio. */
  async down(): Promise<void> {}
}
