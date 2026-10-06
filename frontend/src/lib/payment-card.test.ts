import { describe, expect, it } from 'vitest'
import { detectBrand, formatCardNumber, formatExpiry, passesLuhn, tokenizeCard, validateCardNumber, validateCvv, validateExpiry } from './payment-card'

describe('payment-card (pasarela simulada)', () => {
  it('detecta la marca por el inicio del número', () => {
    expect(detectBrand('4242')).toBe('visa')
    expect(detectBrand('5555 5555')).toBe('mastercard')
    expect(detectBrand('2221 00')).toBe('mastercard')
    expect(detectBrand('3782')).toBe('amex')
    expect(detectBrand('9999')).toBeNull()
  })

  it('valida con Luhn y por longitud de la marca', () => {
    expect(passesLuhn('4242 4242 4242 4242')).toBe(true)
    expect(passesLuhn('4242 4242 4242 4241')).toBe(false)
    expect(validateCardNumber('4242 4242 4242 4242')).toBeNull()
    expect(validateCardNumber('4242 4242 4242 4241')).toMatch(/no es válido/)
    expect(validateCardNumber('4242 4242')).toMatch(/dígitos/)
    expect(validateCardNumber('3782 822463 10005')).toBeNull()
  })

  it('formatea el número y el vencimiento mientras se escribe', () => {
    expect(formatCardNumber('4242424242424242')).toBe('4242 4242 4242 4242')
    expect(formatCardNumber('42424242424242429999')).toBe('4242 4242 4242 4242 999')
    expect(formatCardNumber('55555555555544449')).toBe('5555 5555 5555 4444')
    expect(formatCardNumber('378282246310005')).toBe('3782 822463 10005')
    expect(formatExpiry('1228')).toBe('12/28')
  })

  it('rechaza tarjetas vencidas y meses inválidos', () => {
    const now = new Date(2026, 9, 6)
    expect(validateExpiry('10/26', now)).toBeNull()
    expect(validateExpiry('09/26', now)).toMatch(/vencida/)
    expect(validateExpiry('13/27', now)).toMatch(/mes/)
    expect(validateExpiry('1227', now)).toMatch(/MM\/AA/)
  })

  it('el CVV depende de la marca (Amex usa 4 dígitos)', () => {
    expect(validateCvv('123', '4242')).toBeNull()
    expect(validateCvv('123', '3782')).toMatch(/4 dígitos/)
    expect(validateCvv('1234', '3782')).toBeNull()
  })

  it('el token no contiene el número completo ni el CVV', () => {
    const token = tokenizeCard('4242 4242 4242 4242')
    expect(token).toMatch(/^tok_sim_visa_4242_[a-z0-9]{8}$/)
    expect(token).not.toContain('424242424242')
  })
})
