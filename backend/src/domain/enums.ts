/** Enums del dominio. Los nombres coinciden con los tipos ENUM de PostgreSQL de la migración inicial. */

export enum UserRole {
  Customer = 'CUSTOMER',
  Admin = 'ADMIN',
}

export enum Transmission {
  Manual = 'MANUAL',
  Automatic = 'AUTOMATIC',
}

export enum FuelType {
  Gasoline = 'GASOLINE',
  Diesel = 'DIESEL',
  Hybrid = 'HYBRID',
  Electric = 'ELECTRIC',
}

export enum FuelPolicy {
  FullToFull = 'FULL_TO_FULL',
  SameToSame = 'SAME_TO_SAME',
  Prepaid = 'PREPAID',
}

export enum UnitStatus {
  Available = 'AVAILABLE',
  Maintenance = 'MAINTENANCE',
  OutOfService = 'OUT_OF_SERVICE',
}

/** Idéntico a OrderDetail.status del contrato. */
export enum OrderStatus {
  Pending = 'PENDING',
  Confirmed = 'CONFIRMED',
  Cancelled = 'CANCELLED',
}

/** Estado operativo interno (entrega/devolución); no forma parte del contrato. */
export enum RentalStatus {
  NotStarted = 'NOT_STARTED',
  PickedUp = 'PICKED_UP',
  Returned = 'RETURNED',
}

export enum HoldStatus {
  Held = 'HELD',
  Consumed = 'CONSUMED',
  Expired = 'EXPIRED',
  Released = 'RELEASED',
}

export enum OrderChannel {
  Web = 'WEB',
  BookingHub = 'BOOKING_HUB',
}

export enum ExtraType {
  Equipment = 'EQUIPMENT',
  Coverage = 'COVERAGE',
  Service = 'SERVICE',
}

export enum IdempotencyStatus {
  InProgress = 'IN_PROGRESS',
  Completed = 'COMPLETED',
}

export enum DeliveryStatus {
  Pending = 'PENDING',
  Succeeded = 'SUCCEEDED',
  Failed = 'FAILED',
  Dead = 'DEAD',
}
