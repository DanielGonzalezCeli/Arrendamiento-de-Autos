import { BUSINESS_RULES } from '../../domain/business-rules';
import { FuelPolicy, OrderStatus, Transmission } from '../../domain/enums';
import { nextMaintenanceKm, VehicleState } from '../../domain/fleet-state';
import { toZoned } from '../../domain/zoned-time';
import { FleetUnitView, vehicleIdForPlate } from '../fleet-status/fleet-status.service';
import { CancellationOutcome } from '../orders/reservation.service';
import { Reservation } from '../orders/entities/reservation.entity';

export const V3_PREFIX = '/api/v3';

/** Categorías propias → enum de categoría del contrato v3 (ECONOMICO, COMPACTO, SUV, PREMIUM, VAN). */
const CATEGORY: Record<string, string> = {
  ECONOMY: 'ECONOMICO',
  COMPACT: 'COMPACTO',
  SEDAN: 'COMPACTO',
  SUV: 'SUV',
  PICKUP: 'SUV',
  VAN: 'VAN',
};

export function v3Category(code: string): string {
  return CATEGORY[code] ?? 'PREMIUM';
}

export function v3Transmission(transmission: Transmission): 'MANUAL' | 'AUTOMATICO' {
  return transmission === Transmission.Automatic ? 'AUTOMATICO' : 'MANUAL';
}

const FUEL: Record<FuelPolicy, [string, string]> = {
  [FuelPolicy.FullToFull]: ['LLENO_A_LLENO', 'Lleno a Lleno (Full-to-Full)'],
  [FuelPolicy.SameToSame]: ['MISMO_NIVEL', 'Mismo nivel (Same-to-Same)'],
  [FuelPolicy.Prepaid]: ['PREPAGADO', 'Prepagado (Prepaid)'],
};

/** Las fotos guardadas como ruta relativa se publican con URL absoluta (Booking las muestra desde otro dominio). */
export interface PhotoUrlResolver {
  (imageUrl: string | null): string | null;
}

export function photoResolver(apiBaseUrl: string | undefined, webBaseUrl: string | undefined): PhotoUrlResolver {
  const join = (base: string | undefined, path: string) => (base ? `${base.replace(/\/+$/, '')}${path}` : path);
  return (imageUrl) => {
    if (!imageUrl) return null;
    if (/^https?:\/\//.test(imageUrl)) return imageUrl;
    return imageUrl.startsWith('/api/') ? join(apiBaseUrl, imageUrl) : join(webBaseUrl, imageUrl);
  };
}

function cooldown(unit: Pick<FleetUnitView, 'state' | 'cooldownUntil'>) {
  const minutes = BUSINESS_RULES.CLEANING_BUFFER_MINUTES;
  const active = unit.state === VehicleState.Cleaning && unit.cooldownUntil !== null;
  return {
    cooldown_horas: minutes / 60,
    cooldown_minutos: minutes,
    activo: active,
    inicio_cooldown: active ? new Date(unit.cooldownUntil!.getTime() - minutes * 60_000).toISOString() : null,
    fin_cooldown: active ? unit.cooldownUntil!.toISOString() : null,
    proximo_estado: VehicleState.Available,
  };
}

/** AutoVehiculoCardV2: campos en español y sus equivalentes en inglés, como los define el contrato. */
export function toVehicleCard(unit: FleetUnitView, photoUrl: PhotoUrlResolver) {
  const { model, depot } = unit;
  const photo = photoUrl(model.imageUrl);
  const [fuelCode, fuelText] = FUEL[model.fuelPolicy];
  const category = v3Category(model.category.code);
  const transmission = v3Transmission(model.transmission);
  const nextKm = nextMaintenanceKm(unit.mileage);
  return {
    vehicle_id: unit.vehicleId,
    auto_id: unit.vehicleId,
    id: unit.vehicleId,
    marca: model.make,
    brand: model.make,
    modelo: model.model,
    model: model.model,
    categoria: category,
    category,
    precio_diario: unit.dailyRateUsd,
    daily_price: unit.dailyRateUsd,
    moneda: BUSINESS_RULES.BASE_CURRENCY,
    currency: BUSINESS_RULES.BASE_CURRENCY,
    transmision: transmission,
    transmission,
    asientos: model.seats,
    seats: model.seats,
    puertas: model.doors,
    doors: model.doors,
    maletas_grandes: model.bagCapacity,
    aire_acondicionado: model.airConditioning,
    air_conditioning: model.airConditioning,
    politica_combustible: fuelCode,
    fuel_policy: fuelText,
    cancelacion_gratuita: true,
    free_cancellation: true,
    proveedor: { nombre: model.supplier.name, ubicacion: depot.name },
    ubicacion: {
      agencia: depot.name,
      direccion: depot.address,
      ciudad: depot.city?.name ?? null,
      codigo_aeropuerto: depot.airportCode,
    },
    anio: unit.year,
    color: unit.color,
    estado: unit.state,
    status: unit.state,
    kilometraje_actual: unit.mileage,
    proximo_mantenimiento_km: nextKm,
    mantenimiento_requerido: unit.state === VehicleState.Maintenance,
    foto_url: photo,
    images: photo ? [photo] : [],
    cleaning_cooldown: cooldown(unit),
  };
}

export type CoverageView = 'BASIC' | 'TOTAL';

function plateOf(r: Reservation): string | null {
  const plate = r.vehicleSnapshot?.plate;
  return typeof plate === 'string' ? plate : null;
}

export function refundIdFor(locator: string): string {
  return `REF-AUTO-${locator.replace(/^CAR/, '')}`;
}

const COUNTER_CHECKLIST = [
  'Licencia de conducir física y vigente',
  'Documento de identidad o pasaporte',
  'Tarjeta de crédito a nombre del conductor para la garantía',
  'Código QR del voucher',
];

/** AutoOrderResponseV2. order_id = pnr (las rutas aceptan cualquiera de los dos o el uuid interno). */
export function toOrderResponse(r: Reservation, outcome?: CancellationOutcome) {
  const plate = plateOf(r);
  const vehicleId = plate ? vehicleIdForPlate(plate) : r.vehicleModelId;
  const coverage = (r.partnerData?.coverage_type as CoverageView | undefined) ?? 'BASIC';
  const route = r.routeSnapshot as { pickup?: { name?: string; address?: string }; dropoff?: { name?: string; address?: string } };
  const timeZone = 'America/Guayaquil';
  const pickup = toZoned(r.pickupAt, timeZone);
  const dropoff = toZoned(r.dropoffAt, timeZone);
  const voucher = `BOOKING-CAR-${r.locator}-${vehicleId}-${OrderStatus.Confirmed}`;
  const cancelled = r.status === OrderStatus.Cancelled;
  const refund = cancelled && outcome
    ? {
        refund_id: refundIdFor(r.locator),
        amount: outcome.refundAmount,
        currency: r.currency,
        percentage: outcome.refundPercentage,
        status: 'PROCESSED',
        message: outcome.refundPercentage === 100 ? 'Reembolso total sin penalización' : 'Reembolso con penalización por cancelación tardía',
      }
    : null;
  const self = `${V3_PREFIX}/autos/orders/${r.locator}`;

  return {
    order_id: r.locator,
    pnr: r.locator,
    codigo_reserva: r.locator,
    status: r.status,
    estado: r.status,
    auto_id: vehicleId,
    vehicle_id: vehicleId,
    tipo_cobertura: coverage === 'TOTAL' ? 'TOTAL' : 'BASICA',
    coverage_type: coverage,
    ...(coverage === 'TOTAL' ? { deposito_garantia: 0 } : {}),
    total_price: {
      currency: r.currency,
      total: r.totalPrice,
      desglose: Object.fromEntries(r.priceBreakdown.lines.map((line) => [line.code, line.amount])),
    },
    moneda: r.currency,
    precio_total_monto: r.totalPrice,
    retiro: { fecha: pickup.date, hora: pickup.time, agencia: route.pickup?.name ?? null, direccion: route.pickup?.address ?? null },
    devolucion: { fecha: dropoff.date, hora: dropoff.time, agencia: route.dropoff?.name ?? null, direccion: route.dropoff?.address ?? null },
    voucher_qr_data: voucher,
    voucher_qr_payload: voucher,
    checklist_mostrador: COUNTER_CHECKLIST,
    refund,
    ...(refund ? { reembolso_id: refund.refund_id, monto_reembolsado: refund.amount } : {}),
    created_at: r.createdAt.toISOString(),
    _links: {
      self: { href: self },
      ...(cancelled ? {} : { cancel: { href: `${self}/cancel`, method: 'POST' } }),
    },
  };
}

/** Respuesta 200 de POST /autos/orders/{orderId}/cancel. */
export function toCancelResponse(outcome: CancellationOutcome) {
  const order = toOrderResponse(outcome.reservation, outcome);
  return {
    order_id: order.order_id,
    pnr: order.pnr,
    status: order.status,
    auto_id: order.auto_id,
    refund: order.refund,
    inventory_restoration: { status: 'RESTORED', vehicle_id: order.vehicle_id, new_state: VehicleState.Available },
    message: 'Orden de renta cancelada exitosamente. Vehículo liberado y reembolso procesado.',
  };
}
