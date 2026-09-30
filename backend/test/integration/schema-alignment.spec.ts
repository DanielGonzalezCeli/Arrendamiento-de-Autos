import { DataSource } from 'typeorm';
import { buildTypeOrmOptions } from '../../src/config/typeorm.config';

/**
 * Las entidades TypeORM deben reflejar exactamente las columnas creadas por las migraciones
 * (el esquema lo definen las migraciones, no synchronize). Requiere migraciones aplicadas.
 */
describe('Entidades ↔ esquema de la migración', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await new DataSource(buildTypeOrmOptions(process.env.DATABASE_URL!)).initialize();
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  it('todas las tablas de la migración tienen su entidad', () => {
    // 25 tablas de negocio (docs/BASE_DATOS.md); evita que el test pase vacío si no se cargan entidades.
    expect(dataSource.entityMetadatas).toHaveLength(25);
  });

  it('cada columna mapeada existe en la tabla con la misma nulabilidad', async () => {
    const problems: string[] = [];

    for (const entity of dataSource.entityMetadatas) {
      const rows: { column_name: string; is_nullable: 'YES' | 'NO' }[] = await dataSource.query(
        `SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
        [entity.tableName],
      );
      if (rows.length === 0) {
        problems.push(`Tabla inexistente: ${entity.tableName}`);
        continue;
      }
      const dbColumns = new Map(rows.map((r) => [r.column_name, r.is_nullable === 'YES']));
      for (const column of entity.columns) {
        const dbNullable = dbColumns.get(column.databaseName);
        if (dbNullable === undefined) problems.push(`${entity.tableName}.${column.databaseName} no existe`);
        else if (dbNullable !== column.isNullable) problems.push(`${entity.tableName}.${column.databaseName}: nulabilidad distinta`);
      }
    }

    expect(problems).toEqual([]);
  });
});
