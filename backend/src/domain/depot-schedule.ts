import { DomainError, ProblemCode } from './domain-error';

export interface OpeningHoursRule {
  /** 0 = domingo … 6 = sábado. */
  weekday: number;
  /** "HH:MM" o "HH:MM:SS". */
  opens: string;
  closes: string;
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Día de la semana y hora local ("HH:MM") de un instante en la zona horaria de la agencia. */
export function localWeekdayAndTime(instant: Date, timeZone: string): { weekday: number; time: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { weekday: WEEKDAY_INDEX[get('weekday')], time: `${get('hour')}:${get('minute')}` };
}

/** Fecha local "YYYY-MM-DD" de un instante en la zona horaria de la agencia (para elegir la tarifa vigente). */
export function localDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

/** RN05: la agencia está abierta en ese instante (apertura y cierre inclusive). */
export function isDepotOpenAt(hours: OpeningHoursRule[], timeZone: string, instant: Date): boolean {
  const { weekday, time } = localWeekdayAndTime(instant, timeZone);
  const today = hours.find((h) => h.weekday === weekday);
  if (!today) return false;
  return today.opens.slice(0, 5) <= time && time <= today.closes.slice(0, 5);
}

export function assertDepotOpen(
  hours: OpeningHoursRule[], timeZone: string, instant: Date, depotName: string, moment: 'recogida' | 'devolución',
): void {
  if (!isDepotOpenAt(hours, timeZone, instant)) {
    throw DomainError.conflict(
      ProblemCode.DepotClosed,
      'Agencia cerrada',
      `La agencia "${depotName}" está cerrada en la hora de ${moment} solicitada`,
    );
  }
}
