import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase D (microservicios): el envío de stock a Booking pasa a ms-inventario, que mueve stock_sync_state y
 * stock_sync_log a su schema "inventario". Esta migración elimina las vistas public.* que ms-inventario deja para
 * la versión anterior de este servicio durante el despliegue.
 *
 * En una BD nueva (CI) public.stock_sync_* siguen siendo las tablas de la migración IntegrationV3: no se tocan,
 * porque ms-inventario las reclama al migrar.
 */
export class StockToInventoryService1792200000000 implements MigrationInterface {
  name = 'StockToInventoryService1792200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['stock_sync_log', 'stock_sync_state']) {
      await queryRunner.query(`
        DO $$ BEGIN
          IF (SELECT relkind FROM pg_class WHERE oid = to_regclass('public.${table}')) = 'v' THEN DROP VIEW public.${table}; END IF;
        END $$`);
    }
  }

  async down(): Promise<void> {}
}
