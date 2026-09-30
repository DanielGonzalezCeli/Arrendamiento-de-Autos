const LOCALE = 'es-EC'
/** Todas las agencias están en Ecuador (sin horario de verano). */
export const APP_TIME_ZONE = 'America/Guayaquil'

export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency }).format(amount)
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: APP_TIME_ZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso))
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, { timeZone: APP_TIME_ZONE, day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso))
}

export const TRANSMISSION_LABEL: Record<string, string> = { MANUAL: 'Manual', AUTOMATIC: 'Automática' }

export const FUEL_LABEL: Record<string, string> = {
  GASOLINE: 'Gasolina',
  DIESEL: 'Diésel',
  HYBRID: 'Híbrido',
  ELECTRIC: 'Eléctrico',
}

export const FUEL_POLICY_LABEL: Record<string, string> = {
  FULL_TO_FULL: 'Lleno a lleno',
  SAME_TO_SAME: 'Mismo nivel',
  PREPAID: 'Prepagado',
}

export const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

export function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}
