import { DomainError } from './domain-error';

/** Radio de búsqueda por coordenadas. */
export const COORDINATES_RADIUS_KM = 30;
const EARTH_RADIUS_KM = 6371;

/** Ubicación pedida: LocationPoint del contrato (airport / city_id / coordinates) o una agencia concreta (API interna). */
export interface LocationQuery {
  depotId?: number;
  airport?: string;
  cityId?: number;
  coordinates?: { latitude: number; longitude: number };
}

export interface LocatableDepot {
  id: number;
  cityId: number;
  airportCode: string | null;
  latitude: number;
  longitude: number;
}

/**
 * Resuelve las agencias candidatas para una ubicación. Precedencia (ANALISIS_CONTRATO.md §9):
 * depotId → airport → city_id → coordinates (radio COORDINATES_RADIUS_KM, ordenadas por distancia).
 * Una ubicación sin ningún criterio es inválida (400). Una ubicación válida sin agencias devuelve [].
 */
export function resolveDepots<T extends LocatableDepot>(depots: T[], location: LocationQuery, field: string): T[] {
  if (location.depotId !== undefined) return depots.filter((d) => d.id === location.depotId);
  if (location.airport) {
    const code = location.airport.trim().toUpperCase();
    return depots.filter((d) => d.airportCode === code);
  }
  if (location.cityId !== undefined) return depots.filter((d) => d.cityId === location.cityId);
  if (location.coordinates) {
    const { latitude, longitude } = location.coordinates;
    return depots
      .map((depot) => ({ depot, distance: distanceKm(latitude, longitude, depot.latitude, depot.longitude) }))
      .filter(({ distance }) => distance <= COORDINATES_RADIUS_KM)
      .sort((a, b) => a.distance - b.distance)
      .map(({ depot }) => depot);
  }
  throw DomainError.validation('La ubicación debe indicar airport, city_id o coordinates', [
    { name: field, reason: 'se requiere airport, city_id o coordinates' },
  ]);
}

/** Distancia de gran círculo (fórmula de Haversine). */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}
