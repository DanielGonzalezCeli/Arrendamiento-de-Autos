import { daysBetween, ecuadorDate, toRfc3339 } from '../../lib/datetime'

/**
 * Criterios del buscador. La ubicación se codifica como "airport:UIO", "city:1" o "depot:3";
 * todo vive en la URL (/buscar?...) para que una búsqueda se pueda recargar o compartir.
 */
export interface SearchCriteria {
  pickup: string
  /** Vacío = devolver en la misma ubicación. */
  dropoff: string
  fromDate: string
  fromTime: string
  toDate: string
  toTime: string
  age: number
  currency: string
}

export const SUPPORTED_CURRENCIES = ['USD', 'EUR']
const DEFAULT_TIME = '10:00'

export function defaultCriteria(): SearchCriteria {
  return {
    pickup: '',
    dropoff: '',
    fromDate: ecuadorDate(2),
    fromTime: DEFAULT_TIME,
    toDate: ecuadorDate(5),
    toTime: DEFAULT_TIME,
    age: 30,
    currency: 'USD',
  }
}

export function criteriaToParams(c: SearchCriteria): URLSearchParams {
  const params = new URLSearchParams({
    pickup: c.pickup, from: c.fromDate, fromTime: c.fromTime, to: c.toDate, toTime: c.toTime, age: String(c.age), currency: c.currency,
  })
  if (c.dropoff && c.dropoff !== c.pickup) params.set('dropoff', c.dropoff)
  return params
}

export function criteriaFromParams(params: URLSearchParams): SearchCriteria | null {
  const defaults = defaultCriteria()
  const pickup = params.get('pickup')
  if (!pickup) return null
  return {
    pickup,
    dropoff: params.get('dropoff') ?? '',
    fromDate: params.get('from') ?? defaults.fromDate,
    fromTime: params.get('fromTime') ?? defaults.fromTime,
    toDate: params.get('to') ?? defaults.toDate,
    toTime: params.get('toTime') ?? defaults.toTime,
    age: Number(params.get('age') ?? defaults.age),
    currency: SUPPORTED_CURRENCIES.includes(params.get('currency') ?? '') ? params.get('currency')! : 'USD',
  }
}

/** Validación de comodidad antes de llamar al backend (que valida lo mismo y más). */
export function validateCriteria(c: SearchCriteria): string | null {
  if (!c.pickup) return 'Elige dónde recoger el vehículo.'
  if (!c.fromDate || !c.toDate) return 'Indica las fechas de recogida y devolución.'
  if (toRfc3339(c.toDate, c.toTime) <= toRfc3339(c.fromDate, c.fromTime)) return 'La devolución debe ser posterior a la recogida.'
  if (daysBetween(c.fromDate, c.toDate) > 30) return 'El alquiler máximo es de 30 días.'
  if (!Number.isInteger(c.age) || c.age < 18 || c.age > 99) return 'La edad del conductor debe estar entre 18 y 99 años.'
  return null
}

/** Body de POST /api/search (InternalSearchDto del backend). */
export function criteriaToApiBody(c: SearchCriteria) {
  return {
    ...locationFields('pickup', c.pickup),
    ...(c.dropoff && c.dropoff !== c.pickup ? locationFields('dropoff', c.dropoff) : {}),
    pickupAt: toRfc3339(c.fromDate, c.fromTime),
    dropoffAt: toRfc3339(c.toDate, c.toTime),
    driverAge: c.age,
    currency: c.currency,
  }
}

function locationFields(prefix: 'pickup' | 'dropoff', value: string): Record<string, string | number> {
  const [kind, id] = value.split(':')
  if (kind === 'airport') return { [`${prefix}Airport`]: id }
  if (kind === 'city') return { [`${prefix}CityId`]: Number(id) }
  return { [`${prefix}DepotId`]: Number(id) }
}
