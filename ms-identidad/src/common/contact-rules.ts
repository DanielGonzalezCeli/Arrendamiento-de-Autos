import { isValidPhoneNumber, parsePhoneNumberFromString } from 'libphonenumber-js';

/**
 * Reglas de datos de contacto (nombres, correo, teléfono). Una sola definición usada por el registro,
 * el checkout web y la API de integración. El frontend aplica las mismas reglas para avisar antes,
 * pero la validación que cuenta es esta.
 */

export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 60;
export const EMAIL_MAX_LENGTH = 120;

/**
 * Nombre o apellido: letras (incluye tildes, ñ, ü y letras latinas acentuadas), separadas por un único
 * espacio, apóstrofo o guion ("María José", "O'Connor", "Pérez-Gil"). Sin dígitos ni otros símbolos.
 */
const PERSON_NAME = /^[\p{L}]+(?:[ '’-][\p{L}]+)*$/u;

/**
 * Correo: parte local con caracteres habituales, dominio con al menos un punto y extensión de 2–24 letras
 * (ej. usuario@dominio.com, a.b+c@mail.co.uk). Más estricto que "algo@algo".
 */
const EMAIL = /^[A-Za-z0-9](?:[A-Za-z0-9._%+-]*[A-Za-z0-9])?@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,24}$/;

export function isValidPersonName(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const name = value.trim();
  return name.length >= NAME_MIN_LENGTH && name.length <= NAME_MAX_LENGTH && PERSON_NAME.test(name);
}

export function isValidEmail(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const email = value.trim();
  return email.length <= EMAIL_MAX_LENGTH && !email.includes('..') && EMAIL.test(email) && !gmailProblem(email);
}

const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

/**
 * Reglas de Google para el nombre de usuario de Gmail (la parte antes de "@" y de un "+etiqueta" opcional):
 * solo letras, números y puntos; 6–30 caracteres sin contar los puntos; si tiene 8 o más, al menos una
 * letra (Google no permite usuarios solo numéricos largos); sin punto al inicio, al final ni dos seguidos.
 * Devuelve el motivo si no se cumple, o null.
 */
export function gmailProblem(value: string): string | null {
  const [local, domain] = value.trim().toLowerCase().split('@');
  if (!domain || !GMAIL_DOMAINS.has(domain)) return null;
  const [user, tag] = local.split(/\+(.*)/s);
  if (!/^[a-z0-9.]+$/.test(user)) return 'un correo de Gmail solo admite letras, números y puntos';
  if (user.startsWith('.') || user.endsWith('.') || user.includes('..')) return 'un correo de Gmail no puede empezar ni terminar con punto ni tener dos puntos seguidos';
  const length = user.replace(/\./g, '').length;
  if (length < 6 || length > 30) return 'un correo de Gmail tiene entre 6 y 30 caracteres antes de la @';
  if (length >= 8 && !/[a-z]/.test(user)) return 'un correo de Gmail de 8 o más caracteres debe incluir al menos una letra';
  if (tag !== undefined && !/^[a-z0-9._-]+$/.test(tag)) return 'la etiqueta después de "+" solo admite letras, números, punto, guion y guion bajo';
  return null;
}

/**
 * Forma canónica para detectar cuentas duplicadas: en Gmail los puntos no cuentan, lo que va después de
 * "+" es una etiqueta y googlemail.com es gmail.com. "Dan.Iel+test@googlemail.com" → "daniel@gmail.com".
 */
export function canonicalEmail(value: string): string {
  const email = value.trim().toLowerCase();
  const [local, domain] = email.split('@');
  if (!domain || !GMAIL_DOMAINS.has(domain)) return email;
  return `${local.split('+')[0].replace(/\./g, '')}@gmail.com`;
}

/**
 * Teléfono internacional en formato E.164 (+ código de país + número). Se valida contra los planes de
 * numeración de cada país (librería libphonenumber-js, metadatos de Google): cantidad de dígitos y prefijos.
 * Ej.: +593991234567 (Ecuador), +573001234567 (Colombia), +12025550143 (EE. UU.), +34612345678 (España).
 */
export function isValidInternationalPhone(value: unknown): value is string {
  return typeof value === 'string' && value.trim().startsWith('+') && isValidPhoneNumber(value.trim());
}

/** Normaliza a E.164 sin espacios (ej. "+593 99 123 4567" → "+593991234567"). */
export function normalizePhone(value: string): string {
  return parsePhoneNumberFromString(value.trim())?.number ?? value.trim();
}

/** Normaliza un nombre: sin espacios sobrantes. */
export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}
