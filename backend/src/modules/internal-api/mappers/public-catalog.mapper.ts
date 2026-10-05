import { Depot } from '../../catalog/entities/depot.entity';
import { Extra } from '../../catalog/entities/extra.entity';
import { VehicleModel } from '../../catalog/entities/vehicle-model.entity';
import { SearchOffer, SearchOutcome } from '../../search/search.service';

/** Formato de la API interna (camelCase, respuestas ricas para la UI). */

export function toDepotSummary(depot: Depot) {
  return {
    id: depot.id,
    name: depot.name,
    address: depot.address,
    phone: depot.phone,
    airportCode: depot.airportCode,
    city: depot.city ? { id: depot.city.id, name: depot.city.name } : undefined,
    supplier: depot.supplier ? { id: depot.supplier.id, name: depot.supplier.name } : undefined,
    latitude: depot.latitude,
    longitude: depot.longitude,
    services: depot.services,
    openingHours: (depot.openingHours ?? [])
      .sort((a, b) => a.weekday - b.weekday)
      .map((h) => ({ weekday: h.weekday, opens: h.opens.slice(0, 5), closes: h.closes.slice(0, 5) })),
  };
}

/** Ubicaciones para el buscador: ciudades con sus agencias y aeropuertos. */
export function toLocations(depots: Depot[]) {
  const cities = new Map<number, { id: number; name: string; airports: Set<string>; depots: ReturnType<typeof toDepotSummary>[] }>();
  for (const depot of depots) {
    const city = cities.get(depot.cityId) ?? { id: depot.cityId, name: depot.city.name, airports: new Set<string>(), depots: [] };
    if (depot.airportCode) city.airports.add(depot.airportCode);
    city.depots.push(toDepotSummary(depot));
    cities.set(depot.cityId, city);
  }
  return [...cities.values()].map((c) => ({ id: c.id, name: c.name, airports: [...c.airports], depots: c.depots }));
}

export function toVehicleSummary(model: VehicleModel) {
  return {
    id: model.id,
    make: model.make,
    model: model.model,
    displayName: `${model.make} ${model.model} o similar`,
    category: { code: model.category.code, name: model.category.name, minDriverAge: model.category.minDriverAge },
    supplier: { id: model.supplier.id, name: model.supplier.name },
    transmission: model.transmission,
    fuelType: model.fuelType,
    fuelPolicy: model.fuelPolicy,
    seats: model.seats,
    doors: model.doors,
    bagCapacity: model.bagCapacity,
    airConditioning: model.airConditioning,
    acrissCode: model.acrissCode,
    imageUrl: model.imageUrl,
    description: model.description,
  };
}

function toOffer(offer: SearchOffer) {
  return {
    vehicle: toVehicleSummary(offer.vehicleModel),
    pickupDepot: toDepotSummary(offer.pickupDepot),
    dropoffDepot: toDepotSummary(offer.dropoffDepot),
    oneWay: offer.pickupDepot.id !== offer.dropoffDepot.id,
    availableUnits: offer.availableUnits,
    price: offer.price,
  };
}

export function toSearchResult(outcome: SearchOutcome) {
  return {
    searchToken: outcome.session.id,
    expiresAt: outcome.session.expiresAt,
    currency: outcome.session.currency,
    pickupAt: outcome.session.pickupAt,
    dropoffAt: outcome.session.dropoffAt,
    total: outcome.offers.length,
    offers: outcome.offers.map(toOffer),
  };
}

export function toExtra(extra: Extra) {
  return {
    code: extra.code,
    name: extra.name,
    description: extra.description,
    type: extra.type,
    pricePerDay: extra.pricePerDay,
    maxPrice: extra.maxPrice,
  };
}
