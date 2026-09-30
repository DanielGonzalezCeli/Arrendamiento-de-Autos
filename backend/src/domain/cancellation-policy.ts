import { BUSINESS_RULES, HOUR_MS } from './business-rules';
import { DomainError, ProblemCode } from './domain-error';
import { OrderStatus, RentalStatus } from './enums';
import { fromCents, toCents } from './money';

export interface CancellationInput {
  status: OrderStatus;
  rentalStatus: RentalStatus;
  pickupAt: Date;
  now: Date;
  /** Importe de un día de tarifa base en la moneda de la reserva. */
  dailyAmount: number;
}

export interface CancellationResult {
  fee: number;
  freeCancellation: boolean;
}

/**
 * RN22: se puede cancelar una reserva PENDING/CONFIRMED que no ha empezado.
 * Gratis hasta FREE_CANCELLATION_HOURS antes de la recogida; después se registra una penalización
 * informativa (el reembolso lo ejecuta el dominio de pagos).
 */
export function evaluateCancellation(input: CancellationInput): CancellationResult {
  if (input.status === OrderStatus.Cancelled) {
    throw notAllowed('La reserva ya está cancelada');
  }
  if (input.rentalStatus !== RentalStatus.NotStarted || input.now >= input.pickupAt) {
    throw notAllowed('El alquiler ya comenzó; no se puede cancelar');
  }
  const hoursBefore = (input.pickupAt.getTime() - input.now.getTime()) / HOUR_MS;
  if (hoursBefore >= BUSINESS_RULES.FREE_CANCELLATION_HOURS) {
    return { fee: 0, freeCancellation: true };
  }
  const feeCents = toCents(input.dailyAmount) * BUSINESS_RULES.LATE_CANCELLATION_FEE_DAYS;
  return { fee: fromCents(feeCents), freeCancellation: false };
}

function notAllowed(detail: string): DomainError {
  return DomainError.conflict(ProblemCode.CancellationNotAllowed, 'Cancelación no permitida', detail);
}
