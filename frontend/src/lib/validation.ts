import { isValidPhoneNumber } from 'libphonenumber-js'

/**
 * Validaciones del lado del cliente: las MISMAS reglas que backend/src/domain/contact-rules.ts.
 * Sirven para avisar al instante; el backend vuelve a validar (es la validación que cuenta).
 * Cada función devuelve el mensaje de error o null si el valor es válido.
 */

const PERSON_NAME = /^[\p{L}]+(?:[ '’-][\p{L}]+)*$/u
const EMAIL = /^[A-Za-z0-9](?:[A-Za-z0-9._%+-]*[A-Za-z0-9])?@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,24}$/

export function validateName(value: string, label: string): string | null {
  const name = value.trim()
  if (!name) return `Ingresa tu ${label}.`
  if (name.length < 2) return `El ${label} debe tener al menos 2 letras.`
  if (name.length > 60) return `El ${label} no puede superar 60 caracteres.`
  if (/\d/.test(name)) return `El ${label} no puede contener números.`
  if (!PERSON_NAME.test(name)) return `El ${label} solo admite letras, espacios, apóstrofo (') o guion (-).`
  return null
}

export function validateEmail(value: string): string | null {
  const email = value.trim()
  if (!email) return 'Ingresa tu correo.'
  if (!email.includes('@')) return 'Falta la "@" (ej. nombre@dominio.com).'
  if (email.length > 120 || email.includes('..') || !EMAIL.test(email)) return 'Correo inválido: usa el formato nombre@dominio.com.'
  return null
}

export function validatePassword(value: string): string | null {
  if (value.length < 8) return 'Mínimo 8 caracteres.'
  if (value.length > 72) return 'Máximo 72 caracteres.'
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return 'Debe combinar letras y números.'
  return null
}

/** Teléfono completo en E.164 (ej. +593991234567). Vacío es válido si el campo es opcional. */
export function validatePhone(e164: string, required = false): string | null {
  if (!e164) return required ? 'Ingresa tu teléfono.' : null
  return isValidPhoneNumber(e164) ? null : 'Número inválido para el país elegido: revisa la cantidad de dígitos.'
}

/** Mientras se escribe un nombre: descarta números y símbolos (el usuario ve que no se pueden escribir). */
export function sanitizeNameInput(value: string): string {
  return value.replace(/[^\p{L} '’-]/gu, '').replace(/ {2,}/g, ' ').slice(0, 60)
}

/** Ejecuta varias validaciones y devuelve solo los campos con error. */
export function collectErrors<T extends string>(checks: Record<T, string | null>): Partial<Record<T, string>> {
  return Object.fromEntries(Object.entries(checks).filter(([, message]) => message)) as Partial<Record<T, string>>
}
