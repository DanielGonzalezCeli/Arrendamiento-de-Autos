import { MigrationInterface, QueryRunner } from 'typeorm';

const TABLES = ['stock_sync_state', 'stock_sync_log'] as const;

/**
 * Crea inventario.stock_sync_state y inventario.stock_sync_log. Si vienen del monolito (public.*), se MUEVEN:
 * se conserva lo último que Booking confirmó de cada auto y su timestamp, así el primer snapshot no reenvía toda
 * la flota ni manda timestamps menores (STALE_TIMESTAMP_IGNORED).
 *
 * Mientras se despliega, la versión anterior de ms-reservas todavía escribe en esas tablas: quedan vistas
 * public.* de solo transición (con los valores por defecto), que la migración siguiente de ms-reservas elimina.
 */
export class InventorySchema1792200000000 implements MigrationInterface {
  name = 'InventorySchema1792200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      const [{ legacy, current }] = await queryRunner.query(`
        SELECT (SELECT relkind FROM pg_class WHERE oid = to_regclass('public.${table}')) AS legacy,
               to_regclass('inventario.${table}') IS NOT NULL AS current`);
      if (current) continue;
      if (legacy === 'r') {
        await queryRunner.query(`ALTER TABLE public.${table} SET SCHEMA inventario`);
        await queryRunner.query(`CREATE VIEW public.${table} AS SELECT * FROM inventario.${table}`);
      }
    }
    // Vistas de transición: una vista no hereda los valores por defecto de la tabla.
    if (await this.isView(queryRunner, 'stock_sync_log')) {
      await queryRunner.query(`ALTER VIEW public.stock_sync_log ALTER COLUMN id SET DEFAULT nextval('inventario.stock_sync_log_id_seq')`);
      await queryRunner.query(`ALTER VIEW public.stock_sync_log ALTER COLUMN created_at SET DEFAULT now()`);
    }
    if (await this.isView(queryRunner, 'stock_sync_state')) {
      for (const [column, value] of [['last_timestamp', '0'], ['attempts', '0'], ['updated_at', 'now()']]) {
        await queryRunner.query(`ALTER VIEW public.stock_sync_state ALTER COLUMN ${column} SET DEFAULT ${value}`);
      }
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS inventario.stock_sync_state (
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
      CREATE TABLE IF NOT EXISTS inventario.stock_sync_log (
        id           bigserial PRIMARY KEY,
        item_id      varchar(40) NOT NULL,
        transport    varchar(10) NOT NULL,
        payload      jsonb NOT NULL,
        success      boolean NOT NULL,
        error_code   varchar(60),
        message      varchar(300),
        created_at   timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_stock_sync_log_item ON inventario.stock_sync_log (item_id, created_at DESC)`);
    // Nuevo con los eventos: protege contra eventos que llegan fuera de orden.
    await queryRunner.query(`ALTER TABLE inventario.stock_sync_state ADD COLUMN IF NOT EXISTS last_event_at timestamptz`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE inventario.stock_sync_state DROP COLUMN IF EXISTS last_event_at`);
    for (const table of TABLES) {
      await queryRunner.query(`DROP VIEW IF EXISTS public.${table}`);
      if (await queryRunner.query(`SELECT to_regclass('public.${table}') IS NULL AS free`).then(([r]) => r.free)) {
        await queryRunner.query(`ALTER TABLE inventario.${table} SET SCHEMA public`);
      }
    }
  }

  private async isView(queryRunner: QueryRunner, table: string): Promise<boolean> {
    const [{ kind }] = await queryRunner.query(`SELECT (SELECT relkind FROM pg_class WHERE oid = to_regclass('public.${table}')) AS kind`);
    return kind === 'v';
  }
}
