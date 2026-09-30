import { PriceBreakdown } from '../../domain/pricing';
import { depotLocationPoint } from '../catalog/depot-location';
import { Depot } from '../catalog/entities/depot.entity';
import { VehicleModel } from '../catalog/entities/vehicle-model.entity';

/**
 * RN20 — snapshots históricos de la reserva. Se guardan en snake_case porque son exactamente
 * OrderDetail.vehicle_details y OrderDetail.route_details del contrato (objetos libres).
 */

export function buildVehicleSnapshot(model: VehicleModel, breakdown: PriceBreakdown, plate?: string | null) {
  const standardLines = new Set(['BASE', 'YOUNG_DRIVER', 'ONE_WAY']);
  return {
    vehicle_id: model.id,
    make: model.make,
    model: model.model,
    display_name: `${model.make} ${model.model} o similar`,
    category: { code: model.category.code, name: model.category.name },
    transmission: model.transmission,
    fuel_type: model.fuelType,
    fuel_policy: model.fuelPolicy,
    seats: model.seats,
    doors: model.doors,
    bag_capacity: model.bagCapacity,
    air_conditioning: model.airConditioning,
    image_url: model.imageUrl,
    supplier: { supplier_id: model.supplier.id, name: model.supplier.name, code: model.supplier.code },
    extras: breakdown.lines
      .filter((line) => !standardLines.has(line.code))
      .map((line) => ({ code: line.code, name: line.description, amount: line.amount })),
    ...(plate ? { plate } : {}),
  };
}

export function buildRouteSnapshot(pickupDepot: Depot, dropoffDepot: Depot, pickupAt: Date, dropoffAt: Date, rentalDays: number) {
  const endpoint = (depot: Depot, at: Date) => ({
    depot_id: depot.id,
    name: depot.name,
    address: depot.address,
    datetime: at.toISOString(),
    location: depotLocationPoint(depot),
  });
  return {
    pickup: endpoint(pickupDepot, pickupAt),
    dropoff: endpoint(dropoffDepot, dropoffAt),
    one_way: pickupDepot.id !== dropoffDepot.id,
    rental_days: rentalDays,
  };
}
