import { Page } from '../../../common/pagination';
import { Depot } from '../../catalog/entities/depot.entity';
import { Supplier } from '../../catalog/entities/supplier.entity';
import { VehicleModel } from '../../catalog/entities/vehicle-model.entity';
import { QuotedResult } from '../../orders/entities/search-session.entity';
import { DepotScore } from '../../reviews/reviews.service';

/**
 * Adaptadores modelo interno → schemas del contrato (snake_case, ids integer/uuid).
 * El modelo interno no se deforma para copiar los DTO externos (ANALISIS: §21 Adaptadores).
 */

function metadata(page: Page<unknown>) {
  return { total_results: page.total, next_page: page.nextPage };
}

/** LocationPoint: airport solo si la agencia está en un aeropuerto. */
export function toLocationPoint(depot: Depot) {
  return {
    ...(depot.airportCode ? { airport: depot.airportCode } : {}),
    city_id: depot.cityId,
    coordinates: { latitude: depot.latitude, longitude: depot.longitude },
  };
}

/** CarSearchResponse */
export function toCarSearchResponse(requestId: string, searchToken: string, page: Page<QuotedResult>) {
  return {
    request_id: requestId,
    data: page.items.map((r) => ({ vehicle_id: r.vehicleModelId, price: r.totalPrice, supplier_id: r.supplierId })),
    metadata: metadata(page),
    search_token: searchToken,
  };
}

/** DepotsResponse */
export function toDepotsResponse(requestId: string, page: Page<Depot>) {
  return {
    request_id: requestId,
    data: page.items.map((d) => ({ depot_id: d.id, name: d.name, location: toLocationPoint(d) })),
    metadata: metadata(page),
  };
}

/** DepotScoresResponse */
export function toDepotScoresResponse(requestId: string, page: Page<DepotScore>) {
  return {
    request_id: requestId,
    data: page.items.map((s) => ({ depot_id: s.depotId, score: s.score })),
    metadata: metadata(page),
  };
}

/** CarDetailsResponse (el schema no define metadata; la paginación continúa con `page`). */
export function toCarDetailsResponse(requestId: string, page: Page<VehicleModel>) {
  return {
    request_id: requestId,
    data: page.items.map((m) => ({
      vehicle_id: m.id,
      make: m.make,
      model: m.model,
      doors: m.doors,
      bag_capacity: m.bagCapacity,
      seats: m.seats,
    })),
  };
}

/** SuppliersResponse */
export function toSuppliersResponse(requestId: string, page: Page<Supplier>) {
  return {
    request_id: requestId,
    data: page.items.map((s) => ({ supplier_id: s.id, name: s.name })),
  };
}
