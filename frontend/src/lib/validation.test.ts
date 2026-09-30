import { describe, expect, it } from 'vitest'
import { sanitizeNameInput, validateEmail, validateName, validatePassword, validatePhone } from './validation'

describe('validación de formularios (mismas reglas que el backend)', () => {
  it('nombres: letras con tildes, espacio, apóstrofo y guion; sin números', () => {
    expect(validateName('María José', 'nombre')).toBeNull()
    expect(validateName("O'Connor-Núñez", 'apellido')).toBeNull()
    expect(validateName('Ana3', 'nombre')).toMatch(/números/)
    expect(validateName('A', 'nombre')).toMatch(/al menos 2/)
    expect(validateName('Ana_P', 'nombre')).toMatch(/solo admite/)
  })

  it('al escribir un nombre se eliminan números y símbolos', () => {
    expect(sanitizeNameInput('An4a  P3ré#z')).toBe('Ana Pré' + 'z')
  })

  it('correo con @ y dominio con extensión', () => {
    expect(validateEmail('ana@correo.com')).toBeNull()
    expect(validateEmail('ana.correo.com')).toMatch(/@/)
    expect(validateEmail('ana@correo')).toMatch(/formato/)
    expect(validateEmail('ana@correo.c')).toMatch(/formato/)
  })

  it('contraseña: 8+ caracteres con letras y números', () => {
    expect(validatePassword('Clave2026')).toBeNull()
    expect(validatePassword('corta1')).toMatch(/8/)
    expect(validatePassword('sololetras')).toMatch(/letras y números/)
  })

  it('teléfono: dígitos correctos para cada país', () => {
    expect(validatePhone('+593991234567')).toBeNull()
    expect(validatePhone('+12025550143')).toBeNull()
    expect(validatePhone('+59399123')).toMatch(/dígitos/)
    expect(validatePhone('')).toBeNull()
    expect(validatePhone('', true)).toMatch(/Ingresa/)
  })
})
