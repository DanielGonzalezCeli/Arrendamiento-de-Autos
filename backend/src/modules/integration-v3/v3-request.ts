import { v3Error, V3Code } from '../../common/problem-details/problem-details-v3';
import { InvalidParam } from '../../domain/domain-error';
import { isValidTimeOfDay } from '../../domain/zoned-time';

export type CoverageType = 'BASIC' | 'TOTAL';

/** CreateAutoOrderRequestV2 normalizado (campos en inglés del contrato v3). */
export interface CreateOrderRequest {
  vehicleId: string;
  pickupDate: string;
  dropoffDate: string;
  pickupTime: string;
  dropoffTime: string;
  coverage: CoverageType;
  pickupLocation: string | null;
  dropoffLocation: string | null;
  driver: {
    fullName: string;
    email: string;
    phone: string;
    licenseNumber: string;
    countryLicense: string | null;
    age: number;
    flightNumber: string | null;
  };
}

export type CancelRequester = 'CLIENTE' | 'SAGA_ORCHESTRATOR' | 'ADMIN';

export interface CancelRequest {
  reason: string | null;
  requester: CancelRequester;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_TIME = '10:00';
const COVERAGE: Record<string, CoverageType> = { BASIC: 'BASIC', BASICA: 'BASIC', 'BÁSICA': 'BASIC', TOTAL: 'TOTAL', PREMIUM: 'TOTAL' };

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Primer valor definido entre el nombre canónico y sus alias (Ley de Postel). */
function pick(source: Json, ...names: string[]): unknown {
  for (const name of names) if (source[name] !== undefined && source[name] !== null) return source[name];
  return undefined;
}

function text(value: unknown, max = 200): string | null {
  if (typeof value === 'number') value = String(value);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

export function assertJsonObject(body: unknown): Json {
  if (!isObject(body)) throw v3Error(400, V3Code.MalformedRequest, 'Solicitud mal formada', 'El cuerpo debe ser un objeto JSON');
  return body;
}

/**
 * Lee el cuerpo de POST /reservas. Faltantes o tipos inválidos → 422 INVALID_PAYLOAD; fechas u horas con
 * formato inválido → 422 INVALID_DATES; conductor menor de 18 → 422 DRIVER_UNDERAGE (ninguno dispara la Saga).
 */
export function parseCreateOrder(raw: unknown): CreateOrderRequest {
  const body = assertJsonObject(raw);
  const missing: InvalidParam[] = [];
  const dateErrors: InvalidParam[] = [];

  const vehicleId = text(pick(body, 'vehicle_id', 'auto_id'), 40);
  if (!vehicleId) missing.push({ name: 'vehicle_id', reason: 'es obligatorio' });

  const coverageRaw = text(pick(body, 'coverage_type', 'tipo_cobertura', 'cobertura')) ?? 'BASIC';
  const coverage = COVERAGE[coverageRaw.toUpperCase()];
  if (!coverage) missing.push({ name: 'coverage_type', reason: 'valores admitidos: BASIC, TOTAL' });

  const driverRaw = pick(body, 'driver', 'conductor');
  const driver = isObject(driverRaw) ? driverRaw : {};
  if (!isObject(driverRaw)) missing.push({ name: 'driver', reason: 'es obligatorio' });
  const fullName = text(pick(driver, 'full_name', 'nombre'), 120);
  const email = text(pick(driver, 'email', 'correo'), 120);
  const phone = text(pick(driver, 'phone', 'telefono'), 30);
  const licenseNumber = text(pick(driver, 'license_number', 'licencia_conducir'), 40);
  const ageRaw = pick(driver, 'age', 'edad');
  const age = typeof ageRaw === 'string' && /^\d{1,3}$/.test(ageRaw.trim()) ? Number(ageRaw) : ageRaw;
  if (isObject(driverRaw)) {
    if (!fullName) missing.push({ name: 'driver.full_name', reason: 'es obligatorio' });
    if (!email) missing.push({ name: 'driver.email', reason: 'es obligatorio' });
    else if (!EMAIL.test(email)) missing.push({ name: 'driver.email', reason: 'correo inválido' });
    if (!phone) missing.push({ name: 'driver.phone', reason: 'es obligatorio' });
    if (!licenseNumber) missing.push({ name: 'driver.license_number', reason: 'es obligatorio' });
    if (!Number.isInteger(age)) missing.push({ name: 'driver.age', reason: 'entero obligatorio' });
  }

  const pickupDate = text(pick(body, 'pickup_date', 'fecha_recogida'), 10);
  const dropoffDate = text(pick(body, 'dropoff_date', 'fecha_devolucion'), 10);
  const pickupTime = text(pick(body, 'pickup_time', 'hora_recogida'), 8) ?? DEFAULT_TIME;
  const dropoffTime = text(pick(body, 'dropoff_time', 'hora_devolucion'), 8) ?? DEFAULT_TIME;
  if (!pickupDate) missing.push({ name: 'pickup_date', reason: 'es obligatorio (YYYY-MM-DD)' });
  if (!dropoffDate) missing.push({ name: 'dropoff_date', reason: 'es obligatorio (YYYY-MM-DD)' });
  if (!isValidTimeOfDay(pickupTime)) dateErrors.push({ name: 'pickup_time', reason: 'formato HH:mm (24 h)' });
  if (!isValidTimeOfDay(dropoffTime)) dateErrors.push({ name: 'dropoff_time', reason: 'formato HH:mm (24 h)' });

  if (missing.length) {
    throw v3Error(422, V3Code.InvalidPayload, 'Datos de la reserva inválidos', 'Faltan campos obligatorios o tienen un formato inválido', missing);
  }
  if (dateErrors.length) throw v3Error(422, V3Code.InvalidDates, 'Fechas inválidas', 'La hora de retiro o devolución no es válida', dateErrors);
  if ((age as number) < 18) {
    throw v3Error(422, V3Code.DriverUnderage, 'Conductor menor de edad', 'El conductor debe tener al menos 18 años',
      [{ name: 'driver.age', reason: 'mínimo 18' }]);
  }

  return {
    vehicleId: vehicleId!.toLowerCase(),
    pickupDate: pickupDate!,
    dropoffDate: dropoffDate!,
    pickupTime: pickupTime.slice(0, 5),
    dropoffTime: dropoffTime.slice(0, 5),
    coverage: coverage!,
    pickupLocation: text(pick(body, 'pickup_location', 'lugar_recogida')),
    dropoffLocation: text(pick(body, 'dropoff_location', 'lugar_devolucion')),
    driver: {
      fullName: fullName!,
      email: email!.toLowerCase(),
      phone: phone!,
      licenseNumber: licenseNumber!,
      countryLicense: text(pick(driver, 'country_license', 'pais_licencia'), 60),
      age: age as number,
      flightNumber: text(pick(driver, 'flight_number', 'numero_vuelo'), 12),
    },
  };
}

/** Cuerpo opcional de la cancelación. Sin `solicitante`, se asume la compensación de la Saga (reembolso 100 %). */
export function parseCancel(raw: unknown): CancelRequest {
  const body = isObject(raw) ? raw : {};
  const requester = text(pick(body, 'solicitante', 'requester'))?.toUpperCase();
  if (requester && !['CLIENTE', 'SAGA_ORCHESTRATOR', 'ADMIN'].includes(requester)) {
    throw v3Error(422, V3Code.InvalidPayload, 'Solicitante inválido', 'solicitante admite CLIENTE, SAGA_ORCHESTRATOR o ADMIN',
      [{ name: 'solicitante', reason: 'valor no admitido' }]);
  }
  return { reason: text(pick(body, 'reason', 'motivo'), 300), requester: (requester as CancelRequester) ?? 'SAGA_ORCHESTRATOR' };
}

/** "Carlos Andrés Zambrano" → nombre "Carlos", apellidos "Andrés Zambrano". */
export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const [first, ...rest] = fullName.trim().split(/\s+/);
  return { firstName: first, lastName: rest.join(' ') };
}
