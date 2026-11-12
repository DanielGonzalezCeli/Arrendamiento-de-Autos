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
  /** RN08 + Reto 2 (Cátedra RDA2 §5): limpieza obligatoria de 2 h tras cada devolución (cooldown). */
  CLEANING_BUFFER_MINUTES: 120,
  /** Reto 2: una reserva asignada pasa a LISTO_PARA_ENTREGAR cuando faltan menos de N minutos para el retiro. */
  READY_FOR_PICKUP_WINDOW_MINUTES: 120,
  /**
   * Reto 2: el auto pasa a RESERVADO cuando su próximo retiro está tan cerca que ya no cabe un alquiler mínimo
   * (1 día) más la limpieza. Antes sigue DISPONIBLE: una reserva del 24 al 27 no lo oculta para el 14 al 17
   * (el cruce exacto de fechas lo validan la búsqueda con fechas y la creación de la reserva).
   */
  RESERVED_WINDOW_MINUTES: 24 * 60 + 120,
  /** Reto 2: cada cuántos km toca el mantenimiento preventivo (alerta de odómetro). */
  MAINTENANCE_INTERVAL_KM: 10_000,
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
