import { BUSINESS_RULES } from './business-rules';
import { convertCents, fromCents, toCents } from './money';

export interface ExtraPriceInput {
  code: string;
  name: string;
  pricePerDayUsd: number;
  maxPriceUsd: number | null;
}

export interface PriceInput {
  dailyRateUsd: number;
  days: number;
  driverAge: number;
  oneWay: boolean;
  extras: ExtraPriceInput[];
  /** Moneda solicitada y su tasa desde USD (USD = 1). */
  currency: string;
  rateFromUsd: number;
}

export interface PriceLine {
  code: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

/** Desglose devuelto en OrderPreviewResponse.data.breakdown (objeto libre en el contrato; claves snake_case). */
export interface PriceBreakdown {
  currency: string;
  rental_days: number;
  lines: PriceLine[];
  subtotal: number;
  tax_rate: number;
  tax: number;
  total: number;
}

interface CentsLine {
  code: string;
  description: string;
  quantity: number;
  unitCentsUsd: number;
  amountCentsUsd: number;
}

/**
 * RN04, RN07, RN11, RN12: precio de un alquiler.
 * Todo se calcula en centavos USD; cada línea se convierte a la moneda pedida y el IVA
 * se aplica sobre el subtotal convertido, de modo que total = subtotal + tax siempre cuadra.
 */
export function calculatePrice(input: PriceInput): PriceBreakdown {
  const { days } = input;
  const lines: CentsLine[] = [];

  const dailyCents = toCents(input.dailyRateUsd);
  lines.push({ code: 'BASE', description: 'Tarifa base', quantity: days, unitCentsUsd: dailyCents, amountCentsUsd: dailyCents * days });

  if (input.driverAge < BUSINESS_RULES.YOUNG_DRIVER_AGE_LIMIT) {
    const fee = toCents(BUSINESS_RULES.YOUNG_DRIVER_FEE_PER_DAY_USD);
    lines.push({ code: 'YOUNG_DRIVER', description: 'Recargo conductor joven', quantity: days, unitCentsUsd: fee, amountCentsUsd: fee * days });
  }

  if (input.oneWay) {
    const fee = toCents(BUSINESS_RULES.ONE_WAY_FEE_USD);
    lines.push({ code: 'ONE_WAY', description: 'Devolución en otra agencia', quantity: 1, unitCentsUsd: fee, amountCentsUsd: fee });
  }

  for (const extra of input.extras) {
    const perDay = toCents(extra.pricePerDayUsd);
    const uncapped = perDay * days;
    const amount = extra.maxPriceUsd === null ? uncapped : Math.min(uncapped, toCents(extra.maxPriceUsd));
    lines.push({ code: extra.code, description: extra.name, quantity: days, unitCentsUsd: perDay, amountCentsUsd: amount });
  }

  const converted = lines.map((line) => ({
    code: line.code,
    description: line.description,
    quantity: line.quantity,
    unitCents: convertCents(line.unitCentsUsd, input.rateFromUsd),
    amountCents: convertCents(line.amountCentsUsd, input.rateFromUsd),
  }));
  const subtotalCents = converted.reduce((sum, line) => sum + line.amountCents, 0);
  const taxCents = Math.round(subtotalCents * BUSINESS_RULES.TAX_RATE);

  return {
    currency: input.currency,
    rental_days: days,
    lines: converted.map((line) => ({
      code: line.code,
      description: line.description,
      quantity: line.quantity,
      unit_price: fromCents(line.unitCents),
      amount: fromCents(line.amountCents),
    })),
    subtotal: fromCents(subtotalCents),
    tax_rate: BUSINESS_RULES.TAX_RATE,
    tax: fromCents(taxCents),
    total: fromCents(subtotalCents + taxCents),
  };
}
