import { gmailProblem, isValidEmail, isValidInternationalPhone, isValidPersonName } from './contact-rules';
import { DomainError, InvalidParam, ProblemCode } from './domain-error';

/** RN18: el pago lo procesa otro dominio; aquí solo se valida el formato de la referencia. */
const PAYMENT_REFERENCE = /^[A-Za-z0-9_-]{8,64}$/;

export function assertPaymentReference(reference: string | undefined): void {
  if (!reference || !PAYMENT_REFERENCE.test(reference)) {
    throw new DomainError(ProblemCode.PaymentReferenceInvalid, 400, 'Referencia de pago inválida',
      'payment_reference debe tener 8–64 caracteres alfanuméricos, "-" o "_"', [
        { name: 'payment_reference', reason: 'formato inválido' },
      ]);
  }
}

export interface DriverDetails {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

/**
 * El contrato no marca como requeridos los campos de driver_details; es una regla de negocio nuestra:
 * sin nombre, apellido y correo no se puede entregar el vehículo ni enviar la confirmación.
 * `fieldPrefix` permite reportar el nombre del campo de cada API (driver_details.first_name / driver.firstName).
 */
export function assertDriverDetails(
  driver: DriverDetails, names: { firstName: string; lastName: string; email: string; phone: string },
): void {
  const problems: InvalidParam[] = [];
  if (!isValidPersonName(driver.firstName)) problems.push({ name: names.firstName, reason: 'requerido; solo letras (2–60)' });
  if (!isValidPersonName(driver.lastName)) problems.push({ name: names.lastName, reason: 'requerido; solo letras (2–60)' });
  if (!isValidEmail(driver.email)) {
    const gmail = typeof driver.email === 'string' ? gmailProblem(driver.email) : null;
    problems.push({ name: names.email, reason: gmail ?? 'correo requerido y válido (ej. nombre@dominio.com)' });
  }
  if (driver.phone?.trim() && !isValidInternationalPhone(driver.phone)) {
    problems.push({ name: names.phone, reason: 'teléfono inválido; formato internacional (ej. +593991234567)' });
  }
  if (problems.length) throw DomainError.validation('Datos del conductor incompletos', problems);
}
