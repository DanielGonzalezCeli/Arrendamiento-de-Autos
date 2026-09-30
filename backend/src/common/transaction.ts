import { DataSource, EntityManager } from 'typeorm';

/**
 * Ejecuta `work` dentro de la transacción del llamador si recibe un EntityManager transaccional,
 * o abre una nueva. Permite que la idempotencia y la operación de negocio se confirmen juntas.
 */
export function inTransaction<T>(
  dataSource: DataSource,
  manager: EntityManager | undefined,
  work: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  return manager ? work(manager) : dataSource.transaction(work);
}
