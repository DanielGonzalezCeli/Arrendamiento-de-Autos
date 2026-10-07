import { applyDecorators } from '@nestjs/common';
import { IsString, Matches, MaxLength, MinLength, ValidateBy, ValidationOptions } from 'class-validator';
import { gmailProblem, isValidEmail, isValidInternationalPhone, isValidPersonName } from '../../domain/contact-rules';

/** Decoradores de class-validator que aplican las reglas de dominio de contact-rules.ts en los DTOs. */

export function IsPersonName(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    { name: 'isPersonName', validator: { validate: isValidPersonName, defaultMessage: () => 'solo letras, espacios, apóstrofo o guion (2–60 caracteres)' } },
    options,
  );
}

export function IsStrictEmail(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isStrictEmail',
      validator: {
        validate: isValidEmail,
        defaultMessage: (args) => (typeof args?.value === 'string' && gmailProblem(args.value)) || 'correo inválido (ej. nombre@dominio.com)',
      },
    },
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

/** Contraseña de usuario: 8–72 caracteres con letras y números (bcrypt solo usa los primeros 72 bytes). */
export function IsUserPassword(): PropertyDecorator {
  return applyDecorators(
    IsString(),
    MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' }),
    MaxLength(72),
    Matches(/(?=.*[A-Za-z])(?=.*\d)/, { message: 'La contraseña debe tener letras y números' }),
  );
}
