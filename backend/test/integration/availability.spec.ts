import { DataSource, EntityManager, QueryRunner } from 'typeorm';
import { buildTypeOrmOptions } from '../../src/config/typeorm.config';
import { AvailabilityService } from '../../src/modules/availability/availability.service';

/**
 * RN08/RN09 contra PostgreSQL real. Cada test crea sus datos dentro de una transacción
 * que se revierte al final, así no deja rastros en la BD.
 */
describe('AvailabilityService (inventario por modelo)', () => {
  let dataSource: DataSource;
  let runner: QueryRunner;
  let manager: EntityManager;
  const service = new AvailabilityService();

  const pickupAt = new Date('2031-03-10T15:00:00Z');
  const dropoffAt = new Date('2031-03-13T15:00:00Z');
  let modelId: string;
  let depotId: number;
  let unitIds: string[];

  beforeAll(async () => {
    dataSource = await new DataSource(buildTypeOrmOptions(process.env.DATABASE_URL!)).initialize();
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  beforeEach(async () => {
    runner = dataSource.createQueryRunner();
    await runner.startTransaction();
    manager = runner.manager;

    const [city] = await manager.query(`INSERT INTO cities (name, country_code) VALUES ('Test City', 'ec') RETURNING id`);
    const [supplier] = await manager.query(`INSERT INTO suppliers (code, name) VALUES ('TST', 'Test Rent') RETURNING id`);
    const [depot] = await manager.query(
      `INSERT INTO depots (supplier_id, city_id, name, address, latitude, longitude) VALUES ($1, $2, 'Depot', 'Calle 1', 0, 0) RETURNING id`,
      [supplier.id, city.id],
    );
    const [category] = await manager.query(`INSERT INTO vehicle_categories (code, name, min_driver_age) VALUES ('TST_CAT', 'Test', 21) RETURNING id`);
    const [model] = await manager.query(
      `INSERT INTO vehicle_models (supplier_id, category_id, make, model, transmission, fuel_type, seats, doors, bag_capacity, published)
       VALUES ($1, $2, 'Toyota', 'Corolla', 'AUTOMATIC', 'GASOLINE', 5, 4, 2, true) RETURNING id`,
      [supplier.id, category.id],
    );
    const units = await manager.query(
      `INSERT INTO fleet_units (vehicle_model_id, depot_id, plate, year) VALUES ($1, $2, 'TST-0001', 2025), ($1, $2, 'TST-0002', 2025) RETURNING id`,
      [model.id, depot.id],
    );
    modelId = model.id;
    depotId = depot.id;
    unitIds = units.map((u: { id: string }) => u.id);
  });

  afterEach(async () => {
    await runner.rollbackTransaction();
    await runner.release();
  });

  const count = (extra: Partial<Parameters<AvailabilityService['countAvailableUnits']>[1]> = {}) =>
    service.countAvailableUnits(manager, { vehicleModelId: modelId, depotId, pickupAt, dropoffAt, ...extra });

  async function insertReservation(from: Date, to: Date, fleetUnitId: string | null = null): Promise<string> {
    const [row] = await manager.query(
      `INSERT INTO reservations (locator, channel, owner_sub, vehicle_model_id, fleet_unit_id, pickup_depot_id, dropoff_depot_id,
         pickup_at, dropoff_at, driver_first_name, driver_last_name, driver_email, driver_age, booker_country,
         vehicle_snapshot, route_snapshot, price_breakdown, total_price, currency, payment_reference)
       VALUES (substr(md5(random()::text), 1, 12), 'WEB', 'user:test', $1, $2, $3, $3, $4, $5, 'Ana', 'Pérez', 'ana@test.ec', 30, 'ec',
         '{}', '{}', '{}', 100, 'USD', 'PAY-TEST-0001')
       RETURNING id`,
      [modelId, fleetUnitId, depotId, from, to],
    );
    return row.id;
  }

  async function insertHold(expiresAt: Date): Promise<string> {
    const [session] = await manager.query(
      `INSERT INTO search_sessions (channel, pickup_at, dropoff_at, pickup_depot_ids, dropoff_depot_ids, driver_age, booker_country, currency, request, expires_at)
       VALUES ('WEB', $1, $2, ARRAY[$3::int], ARRAY[$3::int], 30, 'ec', 'USD', '{}', now() + interval '30 minutes') RETURNING id`,
      [pickupAt, dropoffAt, depotId],
    );
    const [hold] = await manager.query(
      `INSERT INTO holds (search_session_id, vehicle_model_id, pickup_depot_id, dropoff_depot_id, owner_sub, pickup_at, dropoff_at, quoted_total, currency, expires_at)
       VALUES ($1, $2, $3, $3, 'user:test', $4, $5, 100, 'USD', $6) RETURNING id`,
      [session.id, modelId, depotId, pickupAt, dropoffAt, expiresAt],
    );
    return hold.id;
  }

  it('sin reservas, todas las unidades están disponibles', async () => {
    expect(await count()).toBe(2);
  });

  it('una reserva solapada consume una unidad', async () => {
    await insertReservation(new Date('2031-03-11T15:00:00Z'), new Date('2031-03-12T15:00:00Z'));
    expect(await count()).toBe(1);
  });

  it('el margen de limpieza cuenta como solapamiento (devolución 30 min antes de la recogida)', async () => {
    await insertReservation(new Date('2031-03-08T15:00:00Z'), new Date('2031-03-10T14:30:00Z'));
    expect(await count()).toBe(1);
  });

  it('una reserva fuera del periodo (más allá del margen) no afecta', async () => {
    await insertReservation(new Date('2031-03-01T15:00:00Z'), new Date('2031-03-05T15:00:00Z'));
    expect(await count()).toBe(2);
  });

  it('las reservas canceladas no consumen inventario', async () => {
    const id = await insertReservation(new Date('2031-03-11T15:00:00Z'), new Date('2031-03-12T15:00:00Z'));
    await manager.query(`UPDATE reservations SET status = 'CANCELLED' WHERE id = $1`, [id]);
    expect(await count()).toBe(2);
  });

  it('excludeReservationId permite recalcular al modificar la propia reserva', async () => {
    const id = await insertReservation(new Date('2031-03-11T15:00:00Z'), new Date('2031-03-12T15:00:00Z'));
    expect(await count({ excludeReservationId: id })).toBe(2);
  });

  it('un bloqueo por mantenimiento retira la unidad', async () => {
    await manager.query(
      `INSERT INTO vehicle_blocks (fleet_unit_id, starts_at, ends_at, reason) VALUES ($1, $2, $3, 'Mantenimiento')`,
      [unitIds[0], new Date('2031-03-09T00:00:00Z'), new Date('2031-03-11T00:00:00Z')],
    );
    expect(await count()).toBe(1);
  });

  it('una unidad fuera de servicio no cuenta', async () => {
    await manager.query(`UPDATE fleet_units SET status = 'MAINTENANCE' WHERE id = $1`, [unitIds[1]]);
    expect(await count()).toBe(1);
  });

  it('un hold vigente consume inventario; uno expirado no; el propio se puede excluir', async () => {
    const active = await insertHold(new Date(Date.now() + 10 * 60_000));
    await insertHold(new Date(Date.now() - 60_000));
    expect(await count()).toBe(1);
    expect(await count({ excludeHoldId: active })).toBe(2);
  });

  it('nunca devuelve negativo', async () => {
    await insertReservation(pickupAt, dropoffAt);
    await insertReservation(pickupAt, dropoffAt);
    await insertReservation(pickupAt, dropoffAt);
    expect(await count()).toBe(0);
  });

  it('RN09: la BD impide asignar la misma placa a dos alquileres solapados', async () => {
    await insertReservation(pickupAt, dropoffAt, unitIds[0]);
    await expect(
      insertReservation(new Date('2031-03-12T15:00:00Z'), new Date('2031-03-14T15:00:00Z'), unitIds[0]),
    ).rejects.toMatchObject({ code: '23P01' }); // exclusion_violation
  });
});
