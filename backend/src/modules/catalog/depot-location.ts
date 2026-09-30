import { Depot } from './entities/depot.entity';

/** LocationPoint del contrato para una agencia: airport solo si está en un aeropuerto. */
export function depotLocationPoint(depot: Depot) {
  return {
    ...(depot.airportCode ? { airport: depot.airportCode } : {}),
    city_id: depot.cityId,
    coordinates: { latitude: depot.latitude, longitude: depot.longitude },
  };
}
