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
  return email.length <= EMAIL_MAX_LENGTH && !email.includes('..') && EMAIL.test(email);
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
