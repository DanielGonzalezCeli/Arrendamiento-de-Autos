import { calculatePrice, PriceInput } from '../../../src/domain/pricing';

const base: PriceInput = {
  dailyRateUsd: 40,
  days: 3,
  driverAge: 30,
  oneWay: false,
  extras: [],
  currency: 'USD',
  rateFromUsd: 1,
};

describe('calculatePrice (RN04, RN07, RN11, RN12)', () => {
  it('tarifa base × días + IVA 15 %', () => {
    const price = calculatePrice(base);
    expect(price.lines).toEqual([{ code: 'BASE', description: 'Tarifa base', quantity: 3, unit_price: 40, amount: 120 }]);
    expect(price.subtotal).toBe(120);
    expect(price.tax).toBe(18);
    expect(price.total).toBe(138);
    expect(price.rental_days).toBe(3);
  });

  it('recargo de conductor joven por día si tiene menos de 25 años', () => {
    const price = calculatePrice({ ...base, driverAge: 22 });
    expect(price.lines.find((l) => l.code === 'YOUNG_DRIVER')?.amount).toBe(30);
    expect(price.subtotal).toBe(150);
  });

  it('sin recargo a los 25 años exactos', () => {
    expect(calculatePrice({ ...base, driverAge: 25 }).lines.map((l) => l.code)).toEqual(['BASE']);
  });

  it('recargo único de devolución en otra agencia', () => {
    const price = calculatePrice({ ...base, oneWay: true });
    expect(price.lines.find((l) => l.code === 'ONE_WAY')).toMatchObject({ quantity: 1, amount: 40 });
  });

  it('los extras se cobran por día respetando su tope', () => {
    const price = calculatePrice({
      ...base,
      days: 10,
      extras: [
        { code: 'GPS', name: 'GPS', pricePerDayUsd: 5, maxPriceUsd: 35 },
        { code: 'CDW', name: 'Cobertura', pricePerDayUsd: 12, maxPriceUsd: null },
      ],
    });
    expect(price.lines.find((l) => l.code === 'GPS')?.amount).toBe(35);
    expect(price.lines.find((l) => l.code === 'CDW')?.amount).toBe(120);
  });

  it('convierte a otra moneda y total = subtotal + IVA sin errores de redondeo', () => {
    const price = calculatePrice({ ...base, dailyRateUsd: 33.33, currency: 'EUR', rateFromUsd: 0.92 });
    expect(price.currency).toBe('EUR');
    expect(price.lines[0].amount).toBe(91.99); // 9999 centavos USD × 0.92 = 9199.08 → 9199
    expect(Math.round((price.subtotal + price.tax) * 100)).toBe(Math.round(price.total * 100));
  });
});
