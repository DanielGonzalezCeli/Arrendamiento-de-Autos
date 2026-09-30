/**
 * Parámetros de negocio con nombre (sin "magic values"). Referencias: docs/REGLAS_NEGOCIO.md.
 */
export const BUSINESS_RULES = {
  /** RN12: IVA Ecuador. */
  TAX_RATE: 0.15,
  /** RN13: moneda base de tarifas. */
  BASE_CURRENCY: 'USD',
  /** RN04: minutos de tolerancia antes de cobrar un día adicional. */
  BILLING_GRACE_MINUTES: 59,
  /** RN02: anticipación mínima para recoger. */
  MIN_LEAD_TIME_MINUTES: 120,
  /** RN03: duración máxima de un alquiler. */
  MAX_RENTAL_DAYS: 30,
  /** RN07: edad desde la que ya no aplica el recargo de conductor joven. */
  YOUNG_DRIVER_AGE_LIMIT: 25,
  YOUNG_DRIVER_FEE_PER_DAY_USD: 10,
  /** RN11: recargo por devolver en otra agencia. */
  ONE_WAY_FEE_USD: 40,
  /** RN08: margen de limpieza entre alquileres de la misma unidad. */
  CLEANING_BUFFER_MINUTES: 60,
  /** RN14–RN16: tiempos de vida. */
  SEARCH_TTL_MINUTES: 30,
  HOLD_TTL_MINUTES: 15,
  PREVIEW_TTL_MINUTES: 15,
  /** RN22: cancelación gratuita hasta N horas antes; después, penalización de N días base. */
  FREE_CANCELLATION_HOURS: 24,
  LATE_CANCELLATION_FEE_DAYS: 1,
  /** RN24: tiempo de vida de un registro de idempotencia. */
  IDEMPOTENCY_TTL_HOURS: 24,
} as const;

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;
