/**
 * Pasarela de pagos SIMULADA ("RutaPay, entorno de pruebas"), lado del navegador.
 *
 * Igual que una pasarela real (Stripe, Payphone…), la tarjeta se valida y se "tokeniza" en el navegador:
 * al backend solo llega un token `tok_sim_<marca>_<últimos 4>_<nonce>`; el número y el CVV nunca salen
 * de aquí. El backend autoriza el token (backend/src/domain/payment-simulator.ts).
 */

export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'diners' | 'discover'

interface BrandInfo {
  label: string
  pattern: RegExp
  lengths: number[]
  cvv: number
  /** Posiciones donde va un espacio al formatear (ej. 4-4-4-4 o 4-6-5). */
  gaps: number[]
}

export const BRANDS: Record<CardBrand, BrandInfo> = {
  visa: { label: 'Visa', pattern: /^4/, lengths: [13, 16, 19], cvv: 3, gaps: [4, 8, 12, 16] },
  mastercard: { label: 'Mastercard', pattern: /^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/, lengths: [16], cvv: 3, gaps: [4, 8, 12] },
  amex: { label: 'American Express', pattern: /^3[47]/, lengths: [15], cvv: 4, gaps: [4, 10] },
  diners: { label: 'Diners Club', pattern: /^3(0[0-5]|[68])/, lengths: [14], cvv: 3, gaps: [4, 10] },
  discover: { label: 'Discover', pattern: /^6(011|5|4[4-9])/, lengths: [16], cvv: 3, gaps: [4, 8, 12] },
}

/** "Visa •••• 4242" a partir de la marca y los últimos 4 dígitos. */
export function describeCard(card: { brand: string; last4: string }): string {
  const label = BRANDS[card.brand as CardBrand]?.label ?? card.brand
  return `${label} •••• ${card.last4}`
}

/** Tarjetas de prueba (mismas terminaciones que interpreta el backend). */
export const TEST_CARDS = [
  { number: '4242 4242 4242 4242', label: 'Visa · aprobada', outcome: 'approved' },
  { number: '5555 5555 5555 4444', label: 'Mastercard · aprobada', outcome: 'approved' },
  { number: '3782 822463 10005', label: 'Amex · aprobada', outcome: 'approved' },
  { number: '4000 0000 0000 0002', label: 'Rechazada por el banco', outcome: 'declined' },
  { number: '4000 0000 0000 9995', label: 'Fondos insuficientes', outcome: 'declined' },
] as const

export const onlyDigits = (value: string) => value.replace(/\D/g, '')

export function detectBrand(number: string): CardBrand | null {
  const digits = onlyDigits(number)
  return (Object.keys(BRANDS) as CardBrand[]).find((brand) => BRANDS[brand].pattern.test(digits)) ?? null
}

/** Algoritmo de Luhn: detecta errores de tipeo en el número de tarjeta. */
export function passesLuhn(number: string): boolean {
  const digits = onlyDigits(number)
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i])
    if (i % 2 === 1) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return digits.length > 0 && sum % 10 === 0
}

export function maxCardDigits(number: string): number {
  const brand = detectBrand(number)
  return brand ? Math.max(...BRANDS[brand].lengths) : 19
}

/** "4242424242424242" → "4242 4242 4242 4242" (Amex: 4-6-5). */
export function formatCardNumber(value: string): string {
  const digits = onlyDigits(value).slice(0, maxCardDigits(value))
  const gaps = BRANDS[detectBrand(digits) ?? 'visa'].gaps
  return digits.split('').reduce((out, d, i) => out + (gaps.includes(i) ? ' ' : '') + d, '')
}

/** "1228" → "12/28" mientras se escribe. */
export function formatExpiry(value: string): string {
  const digits = onlyDigits(value).slice(0, 4)
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits
}

export function validateCardNumber(number: string): string | null {
  const digits = onlyDigits(number)
  if (!digits) return 'Ingresa el número de la tarjeta.'
  const brand = detectBrand(digits)
  if (!brand) return 'Tarjeta no admitida (Visa, Mastercard, American Express, Diners o Discover).'
  if (!BRANDS[brand].lengths.includes(digits.length)) return `Una tarjeta ${BRANDS[brand].label} tiene ${BRANDS[brand].lengths.join(' o ')} dígitos.`
  if (!passesLuhn(digits)) return 'El número de tarjeta no es válido. Revisa que esté bien escrito.'
  return null
}

export function validateExpiry(value: string, now = new Date()): string | null {
  const match = /^(\d{2})\/(\d{2})$/.exec(value)
  if (!match) return 'Usa el formato MM/AA.'
  const month = Number(match[1])
  const year = 2000 + Number(match[2])
  if (month < 1 || month > 12) return 'El mes debe estar entre 01 y 12.'
  // La tarjeta vale hasta el último día del mes indicado
  const endOfMonth = new Date(year, month, 1)
  if (endOfMonth <= now) return 'La tarjeta está vencida.'
  if (year > now.getFullYear() + 20) return 'Revisa el año de vencimiento.'
  return null
}

export function validateCvv(value: string, number: string): string | null {
  const brand = detectBrand(number)
  const expected = brand ? BRANDS[brand].cvv : 3
  if (!/^\d+$/.test(value)) return 'Ingresa el código de seguridad.'
  if (value.length !== expected) return `El código de seguridad tiene ${expected} dígitos${brand === 'amex' ? ' (al frente de la tarjeta)' : ''}.`
  return null
}

/** Simula la tokenización de la pasarela: devuelve un token sin el número completo ni el CVV. */
export function tokenizeCard(number: string): string {
  const digits = onlyDigits(number)
  const brand = detectBrand(digits)
  if (!brand) throw new Error('Tarjeta no admitida')
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => (b % 36).toString(36)).join('')
  return `tok_sim_${brand}_${digits.slice(-4)}_${nonce}`
}
