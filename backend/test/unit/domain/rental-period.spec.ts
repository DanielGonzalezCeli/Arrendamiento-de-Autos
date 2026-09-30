import { DomainError } from '../../../src/domain/domain-error';
import { billableDays, validateRentalWindow } from '../../../src/domain/rental-period';

const at = (iso: string) => new Date(iso);
const now = at('2026-10-01T12:00:00Z');

describe('billableDays (RN04)', () => {
  it('24 h exactas = 1 día', () => {
    expect(billableDays(at('2026-10-10T10:00:00Z'), at('2026-10-11T10:00:00Z'))).toBe(1);
  });

  it('tolera hasta 59 minutos de retraso sin cobrar un día más', () => {
    expect(billableDays(at('2026-10-10T10:00:00Z'), at('2026-10-11T10:59:00Z'))).toBe(1);
  });

  it('a partir del minuto 60 cobra un día adicional', () => {
    expect(billableDays(at('2026-10-10T10:00:00Z'), at('2026-10-11T11:00:00Z'))).toBe(2);
  });

  it('alquileres de pocas horas cuentan como 1 día', () => {
    expect(billableDays(at('2026-10-10T10:00:00Z'), at('2026-10-10T14:00:00Z'))).toBe(1);
  });
});

describe('validateRentalWindow (RN01–RN03)', () => {
  it('acepta una ventana válida', () => {
    expect(() => validateRentalWindow(at('2026-10-05T10:00:00Z'), at('2026-10-08T10:00:00Z'), now)).not.toThrow();
  });

  it('rechaza devolución anterior o igual a la recogida', () => {
    expect(() => validateRentalWindow(at('2026-10-08T10:00:00Z'), at('2026-10-05T10:00:00Z'), now)).toThrow(DomainError);
  });

  it('rechaza recogidas con menos de 2 h de anticipación', () => {
    expect(() => validateRentalWindow(at('2026-10-01T13:00:00Z'), at('2026-10-03T10:00:00Z'), now)).toThrow(/anticipación/);
  });

  it('rechaza alquileres de más de 30 días', () => {
    expect(() => validateRentalWindow(at('2026-10-05T10:00:00Z'), at('2026-11-05T10:00:00Z'), now)).toThrow(/Duración/);
  });

  it('informa el campo del contrato en invalidParams', () => {
    try {
      validateRentalWindow(at('2026-10-08T10:00:00Z'), at('2026-10-05T10:00:00Z'), now);
      fail('debió lanzar');
    } catch (error) {
      expect((error as DomainError).invalidParams?.[0].name).toBe('route.dropoff.datetime');
      expect((error as DomainError).status).toBe(400);
    }
  });
});
