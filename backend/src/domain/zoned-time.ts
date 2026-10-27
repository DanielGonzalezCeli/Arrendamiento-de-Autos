import { localDate, localWeekdayAndTime } from './depot-schedule';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** "HH:mm" 24 h; se tolera ":ss" = ":00" (algunos clientes envían "10:00:00"). */
const TIME = /^([01]\d|2[0-3]):([0-5]\d)(:00)?$/;

/** Minutos que la zona horaria adelanta a UTC en ese instante (Ecuador continental: -300). */
function offsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/**
 * Fecha y hora locales de una agencia → instante UTC. Devuelve null si el formato no es válido
 * o la fecha no existe (ej. 2026-02-30).
 */
export function zonedToUtc(date: string, time: string, timeZone: string): Date | null {
  if (!DATE.test(date) || !TIME.test(time)) return null;
  const naive = new Date(`${date}T${time.slice(0, 5)}:00Z`);
  if (Number.isNaN(naive.getTime()) || naive.toISOString().slice(0, 10) !== date) return null;
  const first = new Date(naive.getTime() - offsetMinutes(naive, timeZone) * 60_000);
  // Segunda pasada por si el instante cae en un cambio de horario (no ocurre en Ecuador, pero es correcto).
  return new Date(naive.getTime() - offsetMinutes(first, timeZone) * 60_000);
}

export function isValidTimeOfDay(time: string): boolean {
  return TIME.test(time);
}

/** Fecha "YYYY-MM-DD" y hora "HH:mm" locales de un instante. */
export function toZoned(instant: Date, timeZone: string): { date: string; time: string } {
  return { date: localDate(instant, timeZone), time: localWeekdayAndTime(instant, timeZone).time };
}
