import { ValidateBy, ValidationOptions } from 'class-validator';
import { isValidEmail, isValidInternationalPhone, isValidPersonName } from '../../domain/contact-rules';

/** Decoradores de class-validator que aplican las reglas de dominio de contact-rules.ts en los DTOs. */

export function IsPersonName(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    { name: 'isPersonName', validator: { validate: isValidPersonName, defaultMessage: () => 'solo letras, espacios, apóstrofo o guion (2–60 caracteres)' } },
    options,
  );
}

export function IsStrictEmail(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    { name: 'isStrictEmail', validator: { validate: isValidEmail, defaultMessage: () => 'correo inválido (ej. nombre@dominio.com)' } },
    options,
  );
}

export function IsInternationalPhone(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isInternationalPhone',
      validator: {
        validate: isValidInternationalPhone,
        defaultMessage: () => 'teléfono inválido para el país indicado (formato internacional, ej. +593991234567)',
      },
    },
    options,
  );
}
