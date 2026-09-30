import { evaluateCancellation } from '../../../src/domain/cancellation-policy';
import { assertDepotOpen, isDepotOpenAt, OpeningHoursRule } from '../../../src/domain/depot-schedule';
import { DomainError, ProblemCode } from '../../../src/domain/domain-error';
import { assertDriverAgeAllowed } from '../../../src/domain/driver-eligibility';
import { OrderStatus, RentalStatus } from '../../../src/domain/enums';
import { generateLocator } from '../../../src/domain/locator';

describe('isDepotOpenAt (RN05) — zona horaria America/Guayaquil (UTC−5)', () => {
  // Lunes a sábado 08:00–19:00; domingo cerrado.
  const hours: OpeningHoursRule[] = [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opens: '08:00:00', closes: '19:00:00' }));
  const tz = 'America/Guayaquil';

  it('abierto un lunes a las 10:00 locales (15:00 UTC)', () => {
    expect(isDepotOpenAt(hours, tz, new Date('2026-10-05T15:00:00Z'))).toBe(true);
  });

  it('cerrado un lunes a las 07:30 locales', () => {
    expect(isDepotOpenAt(hours, tz, new Date('2026-10-05T12:30:00Z'))).toBe(false);
  });

  it('abierto justo a la hora de cierre (inclusive)', () => {
    expect(isDepotOpenAt(hours, tz, new Date('2026-10-06T00:00:00Z'))).toBe(true); // lunes 19:00 local
  });

  it('cerrado el domingo', () => {
    expect(isDepotOpenAt(hours, tz, new Date('2026-10-04T15:00:00Z'))).toBe(false);
  });

  it('assertDepotOpen lanza DEPOT_CLOSED (409)', () => {
    expect(() => assertDepotOpen(hours, tz, new Date('2026-10-04T15:00:00Z'), 'Quito Norte', 'recogida')).toThrow(
      expect.objectContaining({ code: ProblemCode.DepotClosed, status: 409 }),
    );
  });
});

describe('assertDriverAgeAllowed (RN06)', () => {
  it('permite la edad mínima exacta', () => {
    expect(() => assertDriverAgeAllowed(23, 23, 'SUV')).not.toThrow();
  });

  it('rechaza con DRIVER_AGE_RESTRICTION', () => {
    expect(() => assertDriverAgeAllowed(21, 25, 'Premium')).toThrow(
      expect.objectContaining({ code: ProblemCode.DriverAgeRestriction, status: 409 }),
    );
  });
});

describe('evaluateCancellation (RN22)', () => {
  const pickupAt = new Date('2026-10-10T15:00:00Z');
  const input = { status: OrderStatus.Confirmed, rentalStatus: RentalStatus.NotStarted, pickupAt, dailyAmount: 45.5 };

  it('gratis con 24 h o más de anticipación', () => {
    expect(evaluateCancellation({ ...input, now: new Date('2026-10-09T15:00:00Z') })).toEqual({ fee: 0, freeCancellation: true });
  });

  it('penalización de 1 día si faltan menos de 24 h', () => {
    expect(evaluateCancellation({ ...input, now: new Date('2026-10-10T10:00:00Z') })).toEqual({ fee: 45.5, freeCancellation: false });
  });

  it.each([
    ['ya cancelada', { status: OrderStatus.Cancelled }],
    ['vehículo ya entregado', { rentalStatus: RentalStatus.PickedUp }],
    ['la recogida ya pasó', { now: new Date('2026-10-10T16:00:00Z') }],
  ])('no permitida: %s', (_label, override) => {
    const call = () => evaluateCancellation({ ...input, now: new Date('2026-10-09T00:00:00Z'), ...override });
    expect(call).toThrow(DomainError);
    expect(call).toThrow(expect.objectContaining({ code: ProblemCode.CancellationNotAllowed }));
  });
});

describe('generateLocator', () => {
  it('formato PROVEEDOR-XXXXXX sin caracteres ambiguos', () => {
    const locator = generateLocator('andes');
    expect(locator).toMatch(/^ANDES-[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/);
  });
});
