/** Enum ProblemDetails.code del contrato autos-openapi.yaml (lista cerrada). */
export enum ProblemCode {
  ValidationFailed = 'VALIDATION_FAILED',
  CarNoLongerAvailable = 'CAR_NO_LONGER_AVAILABLE',
  PriceChanged = 'PRICE_CHANGED',
  DepotClosed = 'DEPOT_CLOSED',
  DriverAgeRestriction = 'DRIVER_AGE_RESTRICTION',
  BookingNotConfirmed = 'BOOKING_NOT_CONFIRMED',
  CancellationNotAllowed = 'CANCELLATION_NOT_ALLOWED',
  RateLimitExceeded = 'RATE_LIMIT_EXCEEDED',
  PaymentReferenceInvalid = 'PAYMENT_REFERENCE_INVALID',
  PaymentNotAuthorized = 'PAYMENT_NOT_AUTHORIZED',
}

export interface InvalidParam {
  name: string;
  reason: string;
}

/**
 * Error de regla de negocio. Los servicios lo lanzan sin conocer HTTP; el filtro global
 * ProblemDetailsFilter lo convierte en una respuesta application/problem+json.
 */
export class DomainError extends Error {
  constructor(
    readonly code: ProblemCode,
    readonly status: number,
    readonly title: string,
    readonly detail?: string,
    readonly invalidParams?: InvalidParam[],
    /** Segundos para el header Retry-After (409/429 del contrato). */
    readonly retryAfterSeconds?: number,
  ) {
    super(detail ?? title);
  }

  static validation(detail: string, invalidParams?: InvalidParam[]): DomainError {
    return new DomainError(ProblemCode.ValidationFailed, 400, 'Petición inválida', detail, invalidParams);
  }

  static conflict(code: ProblemCode, title: string, detail?: string, retryAfterSeconds?: number): DomainError {
    return new DomainError(code, 409, title, detail, undefined, retryAfterSeconds);
  }

  static notFound(detail: string): DomainError {
    return new DomainError(ProblemCode.ValidationFailed, 404, 'Recurso no encontrado', detail);
  }
}
