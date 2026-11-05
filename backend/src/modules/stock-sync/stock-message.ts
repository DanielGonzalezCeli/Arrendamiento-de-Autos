import { availableUnits, VehicleState } from '../../domain/fleet-state';
import { toZoned } from '../../domain/zoned-time';

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

/** Lo que Booking debería saber de un auto: disponible (1) u ocupado (0) y la franja a la que se refiere. */
export interface DesiredStock {
  itemId: string;
  units: 0 | 1;
  date: string;
  timeSlot: string;
}

/** slot_id canónico acordado con el equipo de integración: slot-YYYYMMDD-HHMM. */
export function slotId(date: string, timeSlot: string): string {
  return `slot-${date.replace(/-/g, '')}-${timeSlot.replace(':', '')}`;
}

/** Franja de 30 min que contiene el instante ("HH:mm"), en la zona horaria de la agencia. */
export function currentSlot(now: Date, timeZone: string): { date: string; time: string } {
  const { date, time } = toZoned(now, timeZone);
  const [h, m] = time.split(':');
  return { date, time: `${h}:${Number(m) < 30 ? '00' : '30'}` };
}

/**
 * Regla acordada con Booking: al reservar se envía 0 con la fecha y hora de RETIRO; en limpieza, entregado o
 * taller, 0 con la franja actual; cuando vuelve a estar disponible, 1 con la franja actual.
 */
export function desiredStock(
  unit: { vehicleId: string; state: VehicleState; nextPickupAt: Date | null }, now: Date, timeZone: string,
): DesiredStock {
  const units = availableUnits(unit.state);
  const reserved = unit.state === VehicleState.Reserved || unit.state === VehicleState.ReadyForPickup;
  const at = reserved && unit.nextPickupAt ? toZoned(unit.nextPickupAt, timeZone) : currentSlot(now, timeZone);
  return { itemId: unit.vehicleId, units, date: at.date, timeSlot: at.time };
}

/**
 * ¿Hay que avisar a Booking? Si cambió la disponibilidad, o si sigue ocupado pero por otra reserva (otra franja).
 * Un "disponible" no se reenvía solo porque avance el reloj.
 */
export function needsPush(desired: DesiredStock, synced: { units: number | null; date: string | null; timeSlot: string | null }): boolean {
  if (synced.units !== desired.units) return true;
  return desired.units === 0 && (synced.date !== desired.date || synced.timeSlot !== desired.timeSlot);
}

/** Timestamp estrictamente creciente por auto (Booking descarta los menores: STALE_TIMESTAMP_IGNORED). */
export function nextTimestamp(lastTimestamp: number, now: number): number {
  return Math.max(now, lastTimestamp + 1);
}
