/**
 * Validación de identificaciones del SRI en el navegador (mismos algoritmos que backend/src/domain/sri.ts;
 * el backend vuelve a validar todo).
 */
export type BuyerIdType = '04' | '05' | '06' | '07'

export const BUYER_ID_LABEL: Record<BuyerIdType, string> = { '05': 'Cédula', '04': 'RUC', '06': 'Pasaporte', '07': 'Consumidor final' }

/** Por encima de este total el SRI no admite facturar a consumidor final. */
export const FINAL_CONSUMER_MAX_TOTAL = 50

export function isValidCedula(value: string): boolean {
  if (!/^\d{10}$/.test(value)) return false
  const province = Number(value.slice(0, 2))
  if (!((province >= 1 && province <= 24) || province === 30) || Number(value[2]) >= 6) return false
  const sum = [...value.slice(0, 9)].reduce((acc, d, i) => {
    const product = Number(d) * (i % 2 === 0 ? 2 : 1)
    return acc + (product > 9 ? product - 9 : product)
  }, 0)
  return (10 - (sum % 10)) % 10 === Number(value[9])
}

function mod11(digits: string, weights: number[]): number {
  const rest = 11 - ([...digits].reduce((acc, d, i) => acc + Number(d) * weights[i], 0) % 11)
  return rest === 11 ? 0 : rest
}

export function isValidRuc(value: string): boolean {
  if (!/^\d{13}$/.test(value) || value.endsWith('000')) return false
  const third = Number(value[2])
  if (third < 6) return isValidCedula(value.slice(0, 10))
  if (third === 9) return mod11(value.slice(0, 9), [4, 3, 2, 7, 6, 5, 4, 3, 2]) === Number(value[9])
  if (third === 6) return mod11(value.slice(0, 8), [3, 2, 7, 6, 5, 4, 3, 2]) === Number(value[8])
  return false
}

export function validateBuyerId(idType: BuyerIdType, raw: string): string | null {
  const value = raw.replace(/[\s-]/g, '').toUpperCase()
  if (idType === '07') return null
  if (!value) return 'Ingresa el número de identificación.'
  if (idType === '05' && !isValidCedula(value)) return 'La cédula no es válida (revisa los 10 dígitos).'
  if (idType === '04' && !isValidRuc(value)) return 'El RUC no es válido (13 dígitos).'
  if (idType === '06' && !/^[A-Z0-9]{5,20}$/.test(value)) return 'El pasaporte debe tener de 5 a 20 letras o números.'
  return null
}
