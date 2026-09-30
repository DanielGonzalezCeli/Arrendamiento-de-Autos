import { getCountryCallingCode, getExampleNumber, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js'
import examples from 'libphonenumber-js/mobile/examples'
import { useState } from 'react'
import { PHONE_COUNTRIES } from '../../lib/countries'
import { INPUT_CLASS } from './Field'

interface PhoneInputProps {
  id: string
  /** Número completo en E.164 (ej. +593991234567) o "" si está vacío. */
  value: string
  onChange: (e164: string) => void
  onBlur?: () => void
  error?: string
}

/**
 * Teléfono internacional: país (con su código +593, +1, +34…) + número nacional.
 * Solo se pueden escribir dígitos y como máximo los que admite el país; el ejemplo y la
 * cantidad de dígitos salen de los metadatos de libphonenumber-js.
 */
export function PhoneInput({ id, value, onChange, onBlur, error }: PhoneInputProps) {
  const parsed = value ? parsePhoneNumberFromString(value) : undefined
  const [country, setCountry] = useState<CountryCode>(parsed?.country ?? 'EC')
  const [national, setNational] = useState(parsed?.nationalNumber ?? '')

  const dialCode = getCountryCallingCode(country)
  const example = getExampleNumber(country, examples)?.nationalNumber ?? ''
  const maxDigits = Math.max(example.length, 6) + 2

  function emit(nextCountry: CountryCode, digits: string) {
    onChange(digits ? `+${getCountryCallingCode(nextCountry)}${digits}` : '')
  }

  return (
    <div>
      <div className="flex gap-2">
        <select
          aria-label="País del teléfono"
          className={`${INPUT_CLASS.replace('w-full', '')} w-36 shrink-0 sm:w-48`}
          value={country}
          onChange={(e) => {
            const next = e.target.value as CountryCode
            setCountry(next)
            emit(next, national)
          }}
        >
          {PHONE_COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name} (+{getCountryCallingCode(c.code)})
            </option>
          ))}
        </select>
        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-500">+{dialCode}</span>
          <input
            id={id}
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            className={INPUT_CLASS}
            style={{ paddingLeft: `${dialCode.length * 0.6 + 1.6}rem` }}
            placeholder={example}
            value={national}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-hint`}
            onBlur={onBlur}
            onChange={(e) => {
              // Solo dígitos; un 0 inicial (formato local) se descarta porque no va con el código de país.
              // El límite de dígitos se aplica aquí y no con maxLength: maxLength recorta mal al pegar sobre texto seleccionado.
              const digits = e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, maxDigits)
              setNational(digits)
              emit(country, digits)
            }}
          />
        </div>
      </div>
      <p id={`${id}-hint`} className={`mt-1.5 text-xs ${error ? 'text-rose-600' : 'text-slate-400'}`}>
        {error ?? (example ? `Ej.: ${example} (${example.length} dígitos, sin el 0 inicial)` : 'Número sin el código de país')}
      </p>
    </div>
  )
}
