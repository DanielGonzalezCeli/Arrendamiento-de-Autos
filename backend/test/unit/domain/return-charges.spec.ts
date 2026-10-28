import { FuelPolicy } from '../../../src/domain/enums';
import {
  ChargeSettings, Cleanliness, computeReturnCharges, DamageSeverity, FuelGrade, lateDaysBetween, ReturnChargeInput,
} from '../../../src/domain/return-charges';

const settings: ChargeSettings = {
  fuelPrices: { EXTRA: 3.17, SUPER: 5.49, DIESEL: 3.11 }, refuelServiceFee: 0, cleaningBasic: 15, cleaningDeep: 40, damageDeductible: 800,
};
const pickupAt = new Date('2026-11-02T15:00:00Z');
const dropoffAt = new Date('2026-11-05T15:00:00Z');
const base: ReturnChargeInput = {
  fuelPolicy: FuelPolicy.FullToFull, fuelGrade: FuelGrade.Diesel, tankLiters: 80, pickupFuelEighths: 8, returnFuelEighths: 8,
  cleanliness: Cleanliness.Clean, damages: [], hasFullCoverage: false, pickupAt, scheduledDropoffAt: dropoffAt, returnedAt: dropoffAt, dailyRate: 85,
};

describe('RN28 — cargos de la inspección de devolución', () => {
  it('devuelto perfecto: sin cargos', () => {
    expect(computeReturnCharges(base, settings)).toMatchObject({ lines: [], subtotal: 0, lateDays: 0, missingEighths: 0 });
  });

  it('combustible: 2/8 de una Hilux (80 L) en diésel = 5,28 gal × 3,11', () => {
    const r = computeReturnCharges({ ...base, returnFuelEighths: 6 }, settings);
    expect(r.lines).toEqual([expect.objectContaining({ code: 'FUEL_DIESEL', quantity: 5.28, unitPrice: 3.11, subtotal: 16.42 })]);
  });

  it('el precio sale del combustible del modelo (Súper) y suma el servicio si está configurado', () => {
    const r = computeReturnCharges({ ...base, fuelGrade: FuelGrade.Super, tankLiters: 45, returnFuelEighths: 4 }, { ...settings, refuelServiceFee: 5 });
    expect(r.lines.map((l) => [l.code, l.subtotal])).toEqual([['FUEL_SUPER', 32.61], ['REFUEL_SERVICE', 5]]);
  });

  it('"mismo nivel" compara contra la entrega; prepago no cobra', () => {
    expect(computeReturnCharges({ ...base, fuelPolicy: FuelPolicy.SameToSame, pickupFuelEighths: 5, returnFuelEighths: 5 }, settings).lines).toEqual([]);
    expect(computeReturnCharges({ ...base, fuelPolicy: FuelPolicy.SameToSame, pickupFuelEighths: 5, returnFuelEighths: 4 }, settings).missingEighths).toBe(1);
    const prepaid = computeReturnCharges({ ...base, fuelPolicy: FuelPolicy.Prepaid, returnFuelEighths: 0 }, settings);
    expect(prepaid.lines).toEqual([]);
    expect(prepaid.notes[0]).toMatch(/prepagado/);
  });

  it('limpieza normal y profunda', () => {
    expect(computeReturnCharges({ ...base, cleanliness: Cleanliness.Dirty }, settings).subtotal).toBe(15);
    expect(computeReturnCharges({ ...base, cleanliness: Cleanliness.VeryDirty }, settings).subtotal).toBe(40);
  });

  it('daños: hasta el deducible; con CDW no se cobran', () => {
    const damages = [
      { zone: 'Parachoques delantero', severity: DamageSeverity.Moderate, description: 'Golpe', estimatedCost: 650 },
      { zone: 'Puerta izquierda', severity: DamageSeverity.Severe, description: 'Abolladura', estimatedCost: 400 },
    ];
    const r = computeReturnCharges({ ...base, damages }, settings);
    expect(r.lines).toEqual([expect.objectContaining({ code: 'DAMAGE', subtotal: 800 })]);
    expect(r.hasSevereDamage).toBe(true);
    const covered = computeReturnCharges({ ...base, damages, hasFullCoverage: true }, settings);
    expect(covered.lines).toEqual([]);
    expect(covered.notes[0]).toMatch(/CDW/);
  });

  it('retraso: tolerancia de 59 min y luego un día por cada 24 h', () => {
    const at = (minutesLate: number) => new Date(dropoffAt.getTime() + minutesLate * 60_000);
    expect(lateDaysBetween(pickupAt, dropoffAt, at(59))).toBe(0);
    expect(lateDaysBetween(pickupAt, dropoffAt, at(60))).toBe(1);
    expect(lateDaysBetween(pickupAt, dropoffAt, at(24 * 60 + 59))).toBe(1);
    expect(lateDaysBetween(pickupAt, dropoffAt, at(24 * 60 + 60))).toBe(2);
    expect(computeReturnCharges({ ...base, returnedAt: at(26 * 60) }, settings).lines)
      .toEqual([expect.objectContaining({ code: 'LATE_RETURN', quantity: 2, subtotal: 170 })]);
  });

  it('todo junto suma las líneas', () => {
    const r = computeReturnCharges({ ...base, returnFuelEighths: 6, cleanliness: Cleanliness.Dirty, returnedAt: new Date(dropoffAt.getTime() + 2 * 3600_000) }, settings);
    expect(r.lines.map((l) => l.code)).toEqual(['FUEL_DIESEL', 'CLEANING', 'LATE_RETURN']);
    expect(r.subtotal).toBeCloseTo(116.42, 2);
  });
});
