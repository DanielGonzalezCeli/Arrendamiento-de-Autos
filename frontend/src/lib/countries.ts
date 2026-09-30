import type { CountryCode } from 'libphonenumber-js'

/**
 * Países del selector de teléfono (Ecuador primero, luego los más frecuentes entre turistas).
 * El código de marcación y la cantidad de dígitos válidos los aporta libphonenumber-js.
 */
export const PHONE_COUNTRIES: { code: CountryCode; name: string }[] = [
  { code: 'EC', name: 'Ecuador' },
  { code: 'CO', name: 'Colombia' },
  { code: 'PE', name: 'Perú' },
  { code: 'US', name: 'Estados Unidos' },
  { code: 'CA', name: 'Canadá' },
  { code: 'MX', name: 'México' },
  { code: 'ES', name: 'España' },
  { code: 'VE', name: 'Venezuela' },
  { code: 'CL', name: 'Chile' },
  { code: 'AR', name: 'Argentina' },
  { code: 'BR', name: 'Brasil' },
  { code: 'BO', name: 'Bolivia' },
  { code: 'UY', name: 'Uruguay' },
  { code: 'PY', name: 'Paraguay' },
  { code: 'PA', name: 'Panamá' },
  { code: 'CR', name: 'Costa Rica' },
  { code: 'GT', name: 'Guatemala' },
  { code: 'CU', name: 'Cuba' },
  { code: 'DO', name: 'República Dominicana' },
  { code: 'GB', name: 'Reino Unido' },
  { code: 'DE', name: 'Alemania' },
  { code: 'FR', name: 'Francia' },
  { code: 'IT', name: 'Italia' },
  { code: 'NL', name: 'Países Bajos' },
  { code: 'PT', name: 'Portugal' },
  { code: 'CH', name: 'Suiza' },
  { code: 'BE', name: 'Bélgica' },
  { code: 'SE', name: 'Suecia' },
  { code: 'IL', name: 'Israel' },
  { code: 'CN', name: 'China' },
  { code: 'JP', name: 'Japón' },
  { code: 'KR', name: 'Corea del Sur' },
  { code: 'IN', name: 'India' },
  { code: 'AU', name: 'Australia' },
]
