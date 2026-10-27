import { translateToV3, V3Code } from '../../src/common/problem-details/problem-details-v3';
import { CleaningCooldownError, DomainError, ProblemCode } from '../../src/domain/domain-error';
import { VehicleState } from '../../src/domain/fleet-state';
import { plateFromVehicleId, vehicleIdForPlate } from '../../src/modules/fleet-status/fleet-status.service';
import { IdempotencyKeyReusedError } from '../../src/modules/idempotency/idempotency.service';
import { generatePnr } from '../../src/modules/integration-v3/v3-orders.service';
import { parseCancel, parseCreateOrder, splitFullName } from '../../src/modules/integration-v3/v3-request';
import { desiredStock, needsPush, nextTimestamp, slotId } from '../../src/modules/stock-sync/stock-message';

const driver = { full_name: 'Carlos Andrés Zambrano', email: 'carlos@example.com', phone: '+593987654321', license_number: '1710034065', age: 28 };
const body = { vehicle_id: 'auto-pan-1001', pickup_date: '2026-11-15', dropoff_date: '2026-11-18', pickup_time: '10:00', coverage_type: 'BASIC', driver };

function errorOf(fn: () => unknown): DomainError {
  try {
    fn();
  } catch (error) {
    return error as DomainError;
  }
  throw new Error('no lanzó');
}

describe('Contrato v3 — cuerpo de la reserva (Ley de Postel)', () => {
  it('lee el cuerpo canónico en inglés', () => {
    const parsed = parseCreateOrder(body);
    expect(parsed).toMatchObject({
      vehicleId: 'auto-pan-1001', pickupDate: '2026-11-15', dropoffDate: '2026-11-18', pickupTime: '10:00', dropoffTime: '10:00', coverage: 'BASIC',
      driver: { fullName: 'Carlos Andrés Zambrano', email: 'carlos@example.com', age: 28 },
    });
  });

  it('acepta los alias en español', () => {
    const parsed = parseCreateOrder({
      auto_id: 'AUTO-PAN-1001', fecha_recogida: '2026-11-15', fecha_devolucion: '2026-11-18', hora_recogida: '14:30', cobertura: 'TOTAL',
      conductor: { nombre: 'Ana Pérez', correo: 'ANA@correo.ec', telefono: '+593991234567', licencia_conducir: 'X1', edad: '30' },
    });
    expect(parsed).toMatchObject({ vehicleId: 'auto-pan-1001', pickupTime: '14:30', coverage: 'TOTAL', driver: { email: 'ana@correo.ec', age: 30 } });
  });

  it('faltantes → 422 INVALID_PAYLOAD con invalid_params', () => {
    const error = errorOf(() => parseCreateOrder({ vehicle_id: 'auto-pan-1001', driver: { full_name: 'Ana' } }));
    expect(error.status).toBe(422);
    expect(error.code).toBe(V3Code.InvalidPayload);
    expect(error.invalidParams?.map((p) => p.name)).toEqual(expect.arrayContaining(['pickup_date', 'driver.email', 'driver.age']));
  });

  it('menor de 18 → 422 DRIVER_UNDERAGE; hora inválida → 422 INVALID_DATES (ninguno es 409)', () => {
    expect(errorOf(() => parseCreateOrder({ ...body, driver: { ...driver, age: 17 } }))).toMatchObject({ status: 422, code: V3Code.DriverUnderage });
    expect(errorOf(() => parseCreateOrder({ ...body, pickup_time: '10 am' }))).toMatchObject({ status: 422, code: V3Code.InvalidDates });
  });

  it('cuerpo que no es objeto → 400 MALFORMED_REQUEST', () => {
    expect(errorOf(() => parseCreateOrder('hola'))).toMatchObject({ status: 400, code: V3Code.MalformedRequest });
  });

  it('cancelación: sin solicitante se asume la Saga; CLIENTE se respeta', () => {
    expect(parseCancel(undefined).requester).toBe('SAGA_ORCHESTRATOR');
    expect(parseCancel({ solicitante: 'cliente', motivo: 'cambio' })).toEqual({ requester: 'CLIENTE', reason: 'cambio' });
  });

  it('separa nombre y apellidos', () => {
    expect(splitFullName('Carlos Andrés Zambrano')).toEqual({ firstName: 'Carlos', lastName: 'Andrés Zambrano' });
  });
});

describe('Contrato v3 — identificadores', () => {
  it('vehicle_id ↔ placa', () => {
    expect(vehicleIdForPlate('PAN-1001')).toBe('auto-pan-1001');
    expect(plateFromVehicleId('auto-pan-1001')).toBe('PAN-1001');
    expect(plateFromVehicleId('auto-spark-01')).toBeNull();
  });

  it('PNR de 8 caracteres CAR + 5', () => {
    expect(generatePnr()).toMatch(/^CAR[A-Z2-9]{5}$/);
  });
});

describe('Contrato v3 — semántica de errores para la Saga', () => {
  it('solo "no disponible" es 409 (dispara la compensación)', () => {
    expect(translateToV3(DomainError.conflict(ProblemCode.CarNoLongerAvailable, 'x'))).toMatchObject({ status: 409, code: V3Code.VehicleUnavailable });
    expect(translateToV3(new CleaningCooldownError(new Date()))).toMatchObject({ status: 409, code: V3Code.VehicleInCleaningCooldown });
  });

  it('edad de la categoría y agencia cerrada → 422; Idempotency-Key reutilizada o en curso → 400', () => {
    expect(translateToV3(DomainError.conflict(ProblemCode.DriverAgeRestriction, 'x'))).toMatchObject({ status: 422, code: V3Code.DriverUnderage });
    expect(translateToV3(DomainError.conflict(ProblemCode.DepotClosed, 'x'))).toMatchObject({ status: 422, code: V3Code.InvalidDates });
    expect(translateToV3(new IdempotencyKeyReusedError())).toMatchObject({ status: 400, code: V3Code.IdempotencyConflict });
    expect(translateToV3(DomainError.conflict(ProblemCode.ValidationFailed, 'Operación en curso', 'x', 1))).toMatchObject({ status: 400 });
  });

  it('ventana de fechas inválida → 422 INVALID_DATES con nombres del contrato', () => {
    const t = translateToV3(DomainError.validation('x', [{ name: 'dates.dropoff.datetime', reason: 'r' }]));
    expect(t).toMatchObject({ status: 422, code: V3Code.InvalidDates, invalidParams: [{ name: 'dropoff_date', reason: 'r' }] });
  });
});

describe('inventory.proto — PushStockUpdate', () => {
  const now = new Date('2026-11-10T15:10:00Z'); // 10:10 en Ecuador
  const tz = 'America/Guayaquil';

  it('slot_id canónico slot-YYYYMMDD-HHMM', () => {
    expect(slotId('2026-11-15', '10:00')).toBe('slot-20261115-1000');
  });

  it('reservado → 0 con la fecha y hora de retiro; disponible → 1 con la franja actual', () => {
    const reserved = desiredStock({ vehicleId: 'auto-pan-1001', state: VehicleState.Reserved, nextPickupAt: new Date('2026-11-15T15:00:00Z') }, now, tz);
    expect(reserved).toEqual({ itemId: 'auto-pan-1001', units: 0, date: '2026-11-15', timeSlot: '10:00' });
    const free = desiredStock({ vehicleId: 'auto-pan-1001', state: VehicleState.Available, nextPickupAt: null }, now, tz);
    expect(free).toEqual({ itemId: 'auto-pan-1001', units: 1, date: '2026-11-10', timeSlot: '10:00' });
  });

  it('solo se reenvía si cambia la disponibilidad o la reserva', () => {
    const free = { itemId: 'a', units: 1 as const, date: '2026-11-10', timeSlot: '10:30' };
    expect(needsPush(free, { units: 1, date: '2026-11-10', timeSlot: '10:00' })).toBe(false);
    expect(needsPush(free, { units: null, date: null, timeSlot: null })).toBe(true);
    expect(needsPush({ ...free, units: 0 }, { units: 0, date: '2026-11-12', timeSlot: '10:00' })).toBe(true);
  });

  it('timestamp estrictamente creciente', () => {
    expect(nextTimestamp(1000, 500)).toBe(1001);
    expect(nextTimestamp(1000, 5000)).toBe(5000);
  });
});
