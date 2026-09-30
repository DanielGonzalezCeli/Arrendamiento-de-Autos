/**
 * Dinero en centavos enteros para evitar errores de coma flotante (0.1 + 0.2 ≠ 0.3).
 * Solo se convierte a decimal al construir la respuesta.
 */
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

/** Convierte centavos USD a centavos de la moneda destino. */
export function convertCents(usdCents: number, rateFromUsd: number): number {
  return Math.round(usdCents * rateFromUsd);
}
