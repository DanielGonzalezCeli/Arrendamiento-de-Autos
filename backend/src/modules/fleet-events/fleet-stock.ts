import { availableUnits, VehicleState } from '../../domain/fleet-state';
import { toZoned } from '../../domain/zoned-time';

/**
 * Stock que Booking debería tener de un auto, tal como viaja en los eventos de flota (data.vehicles[]).
 * Lo calcula ms-reservas, dueño del estado de la flota; ms-inventario solo lo compara y lo envía.
 */
export interface VehicleStock {
  vehicle_id: string;
  state: VehicleState;
  available_units: 0 | 1;
  date: string;
  time_slot: string;
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
export function vehicleStock(
  unit: { vehicleId: string; state: VehicleState; nextPickupAt: Date | null }, now: Date, timeZone: string,
): VehicleStock {
  const reserved = unit.state === VehicleState.Reserved || unit.state === VehicleState.ReadyForPickup;
  const at = reserved && unit.nextPickupAt ? toZoned(unit.nextPickupAt, timeZone) : currentSlot(now, timeZone);
  return { vehicle_id: unit.vehicleId, state: unit.state, available_units: availableUnits(unit.state), date: at.date, time_slot: at.time };
}
