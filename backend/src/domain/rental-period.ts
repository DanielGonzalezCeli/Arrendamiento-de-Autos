import { BUSINESS_RULES, DAY_MS, MINUTE_MS } from './business-rules';
import { DomainError } from './domain-error';

/**
 * RN01–RN03: la recogida es anterior a la devolución, con anticipación mínima y duración máxima.
 * `fieldPrefix` permite reportar el nombre del campo del contrato (ej. "route").
 */
export function validateRentalWindow(pickupAt: Date, dropoffAt: Date, now: Date, fieldPrefix = 'route'): void {
  if (Number.isNaN(pickupAt.getTime()) || Number.isNaN(dropoffAt.getTime())) {
    throw DomainError.validation('Fechas inválidas', [{ name: fieldPrefix, reason: 'datetime inválido' }]);
  }
  if (pickupAt >= dropoffAt) {
    throw DomainError.validation('La devolución debe ser posterior a la recogida', [
      { name: `${fieldPrefix}.dropoff.datetime`, reason: 'debe ser posterior a pickup.datetime' },
    ]);
  }
  const minPickup = now.getTime() + BUSINESS_RULES.MIN_LEAD_TIME_MINUTES * MINUTE_MS;
  if (pickupAt.getTime() < minPickup) {
    throw DomainError.validation('La recogida debe tener una anticipación mínima', [
      { name: `${fieldPrefix}.pickup.datetime`, reason: `mínimo ${BUSINESS_RULES.MIN_LEAD_TIME_MINUTES} minutos en el futuro` },
    ]);
  }
  if (dropoffAt.getTime() - pickupAt.getTime() > BUSINESS_RULES.MAX_RENTAL_DAYS * DAY_MS) {
    throw DomainError.validation('Duración máxima excedida', [
      { name: `${fieldPrefix}.dropoff.datetime`, reason: `máximo ${BUSINESS_RULES.MAX_RENTAL_DAYS} días` },
    ]);
  }
}

/**
 * RN04: días facturables. Cada bloque de 24 h cuenta como un día; se tolera un retraso de
 * BILLING_GRACE_MINUTES antes de cobrar un día extra. Mínimo 1 día.
 */
export function billableDays(pickupAt: Date, dropoffAt: Date): number {
  const minutes = (dropoffAt.getTime() - pickupAt.getTime()) / MINUTE_MS;
  const chargeable = Math.max(minutes - BUSINESS_RULES.BILLING_GRACE_MINUTES, 0);
  return Math.max(1, Math.ceil(chargeable / (24 * 60)));
}
