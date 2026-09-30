import { DomainError, InvalidParam, ProblemCode } from './domain-error';

/** RN18: el pago lo procesa otro dominio; aquí solo se valida el formato de la referencia. */
const PAYMENT_REFERENCE = /^[A-Za-z0-9_-]{8,64}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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
export function assertDriverDetails(driver: DriverDetails, names: { firstName: string; lastName: string; email: string }): void {
  const problems: InvalidParam[] = [];
  if (!driver.firstName?.trim()) problems.push({ name: names.firstName, reason: 'requerido' });
  if (!driver.lastName?.trim()) problems.push({ name: names.lastName, reason: 'requerido' });
  if (!driver.email?.trim() || !EMAIL.test(driver.email.trim())) problems.push({ name: names.email, reason: 'correo requerido y válido' });
  if (problems.length) throw DomainError.validation('Datos del conductor incompletos', problems);
}
