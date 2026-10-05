import type { Depot } from './types'

/**
 * Nombre legible de una agencia: primero el lugar y luego la empresa.
 * "Andes — Aeropuerto Mariscal Sucre (UIO)" → "Aeropuerto Mariscal Sucre (UIO) · Andes".
 */
export function depotLabel(depot: Pick<Depot, 'name'>): string {
  const [company, ...place] = depot.name.split(' — ')
  return place.length ? `${place.join(' — ')} · ${company}` : depot.name
}

/** Enlace a Google Maps con las coordenadas de la agencia. */
export function mapsUrl(depot: Pick<Depot, 'latitude' | 'longitude'>): string {
  return `https://www.google.com/maps/search/?api=1&query=${depot.latitude},${depot.longitude}`
}
