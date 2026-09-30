/**
 * Fechas del buscador. Las agencias están en Ecuador (UTC−5, sin horario de verano), así que
 * fecha + hora local se envían al backend como RFC 3339 con offset fijo "-05:00".
 */
export const ECUADOR_OFFSET = '-05:00'

/** "2026-10-10" + "10:00" → "2026-10-10T10:00:00-05:00" */
export function toRfc3339(date: string, time: string): string {
  return `${date}T${time}:00${ECUADOR_OFFSET}`
}

/** Fecha "YYYY-MM-DD" en Ecuador, `daysFromToday` días después de hoy. */
export function ecuadorDate(daysFromToday: number, now = new Date()): string {
  const shifted = new Date(now.getTime() - 5 * 3600_000 + daysFromToday * 24 * 3600_000)
  return shifted.toISOString().slice(0, 10)
}

/** Horas seleccionables cada 30 minutos (06:00–22:00). */
export function timeOptions(): string[] {
  const options: string[] = []
  for (let minutes = 6 * 60; minutes <= 22 * 60; minutes += 30) {
    options.push(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`)
  }
  return options
}

/** Días entre dos fechas "YYYY-MM-DD" (para validar en el formulario antes de llamar al backend). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / (24 * 3600_000))
}
