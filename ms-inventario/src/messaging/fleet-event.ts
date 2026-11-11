import { VehicleStock } from '../stock/stock-message';

/** Tipos de evento de flota que publica ms-reservas (routing keys flota.estado_cambiado y flota.snapshot). */
export const FLEET_EVENT_TYPES = ['ec.rutalibre.flota.estado_cambiado', 'ec.rutalibre.flota.snapshot'] as const;

/**
 * Evento de flota con el sobre de CloudEvents 1.0 (mismo formato que los eventos del contrato v3).
 * data.vehicles: estado y stock que Booking debería tener de cada auto.
 */
export interface FleetEvent {
  specversion: '1.0';
  id: string;
  type: (typeof FLEET_EVENT_TYPES)[number];
  source: string;
  time: string;
  correlationid: string;
  data: { vehicles: VehicleStock[] };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SLOT = /^\d{2}:\d{2}$/;

/** Valida un mensaje recibido. Devuelve el motivo si no es un evento de flota válido (va a la cola de muertos). */
export function parseFleetEvent(raw: string): { event: FleetEvent } | { error: string } {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { error: 'no es JSON' };
  }
  const e = value as Partial<FleetEvent>;
  if (e?.specversion !== '1.0' || typeof e.id !== 'string') return { error: 'no es un CloudEvent 1.0' };
  if (!FLEET_EVENT_TYPES.includes(e.type as FleetEvent['type'])) return { error: `tipo desconocido: ${String(e.type)}` };
  if (typeof e.time !== 'string' || Number.isNaN(Date.parse(e.time))) return { error: 'time inválido' };
  const vehicles = e.data?.vehicles;
  if (!Array.isArray(vehicles)) return { error: 'data.vehicles debe ser una lista' };
  const bad = vehicles.find((v) => typeof v?.vehicle_id !== 'string' || ![0, 1].includes(v.available_units)
    || typeof v.date !== 'string' || !DATE.test(v.date) || typeof v.time_slot !== 'string' || !SLOT.test(v.time_slot));
  if (bad) return { error: `vehículo inválido: ${JSON.stringify(bad).slice(0, 120)}` };
  return { event: { ...(e as FleetEvent), correlationid: typeof e.correlationid === 'string' ? e.correlationid : `cid-inv-${e.id.slice(0, 8)}` } };
}
