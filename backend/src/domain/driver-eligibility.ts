import { DomainError, ProblemCode } from './domain-error';

/** RN06: el conductor cumple la edad mínima de la categoría. */
export function isDriverAgeAllowed(driverAge: number, minDriverAge: number): boolean {
  return driverAge >= minDriverAge;
}

export function assertDriverAgeAllowed(driverAge: number, minDriverAge: number, categoryName: string): void {
  if (!isDriverAgeAllowed(driverAge, minDriverAge)) {
    throw DomainError.conflict(
      ProblemCode.DriverAgeRestriction,
      'Restricción de edad del conductor',
      `La categoría "${categoryName}" requiere conductores de al menos ${minDriverAge} años`,
    );
  }
}
