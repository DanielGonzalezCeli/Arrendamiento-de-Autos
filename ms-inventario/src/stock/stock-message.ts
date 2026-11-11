/** StockUpdateMessage de contracts/inventory.proto (los nombres de campo son los del .proto). */
export interface StockUpdateMessage {
  service_id: string;
  item_id: string;
  date: string;
  time_slot: string;
  available_units: number;
  timestamp: number;
  slot_id: string;
}

/** StockUpdateAck de contracts/inventory.proto. */
export interface StockUpdateAck {
  success: boolean;
  message?: string;
  processed_at?: string | number;
  error_code?: string;
  current_available?: number;
}

/**
 * Stock que debería tener Booking para un auto, tal como lo publica ms-reservas (dueño del estado de la flota):
 * 0 u 1 unidades y la franja a la que se refiere (al reservar, la fecha y hora de retiro).
 */
export interface VehicleStock {
  vehicle_id: string;
  state: string;
  available_units: 0 | 1;
  date: string;
  time_slot: string;
}

/** slot_id canónico acordado con el equipo de integración: slot-YYYYMMDD-HHMM. */
export function slotId(date: string, timeSlot: string): string {
  return `slot-${date.replace(/-/g, '')}-${timeSlot.replace(':', '')}`;
}

/**
 * ¿Hay que avisar a Booking? Si cambió la disponibilidad, o si sigue ocupado pero por otra reserva (otra franja).
 * Un "disponible" no se reenvía solo porque avance el reloj.
 */
export function needsPush(desired: VehicleStock, synced: { units: number | null; date: string | null; timeSlot: string | null }): boolean {
  if (synced.units !== desired.available_units) return true;
  return desired.available_units === 0 && (synced.date !== desired.date || synced.timeSlot !== desired.time_slot);
}

/** Timestamp estrictamente creciente por auto (Booking descarta los menores: STALE_TIMESTAMP_IGNORED). */
export function nextTimestamp(lastTimestamp: number, now: number): number {
  return Math.max(now, lastTimestamp + 1);
}
