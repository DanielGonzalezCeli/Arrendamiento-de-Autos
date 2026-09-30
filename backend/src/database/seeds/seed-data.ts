import { ExtraType, FuelPolicy, FuelType, Transmission } from '../../domain/enums';

/** Datos de demostración (Ecuador). Los ids integer coinciden con lo que expone la API (depot_id, supplier_id, city_id). */

export const CITIES = [
  { id: 1, name: 'Quito', countryCode: 'ec' },
  { id: 2, name: 'Guayaquil', countryCode: 'ec' },
  { id: 3, name: 'Cuenca', countryCode: 'ec' },
];

export const SUPPLIERS = [
  { id: 1, code: 'ANDES', name: 'Andes Rent a Car' },
  { id: 2, code: 'PACIF', name: 'Pacífico Car Rental' },
];

const AIRPORT_HOURS = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opens: '05:00', closes: '23:30' }));
const CITY_HOURS = [
  ...[1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opens: '08:00', closes: '19:00' })),
  { weekday: 0, opens: '09:00', closes: '14:00' },
];

export const DEPOTS = [
  {
    id: 1, supplierId: 1, cityId: 1, name: 'Andes — Aeropuerto Mariscal Sucre (UIO)', address: 'Aeropuerto Internacional Mariscal Sucre, Tababela',
    airportCode: 'UIO', latitude: -0.129167, longitude: -78.3575, phone: '022000001', services: ['AIRPORT_COUNTER', 'SHUTTLE', 'AFTER_HOURS_RETURN'], hours: AIRPORT_HOURS,
  },
  {
    id: 2, supplierId: 1, cityId: 1, name: 'Andes — Quito Norte', address: 'Av. Amazonas N39-123 y Pereira',
    airportCode: null, latitude: -0.176700, longitude: -78.480000, phone: '022000002', services: ['CITY_OFFICE'], hours: CITY_HOURS,
  },
  {
    id: 3, supplierId: 1, cityId: 2, name: 'Andes — Aeropuerto José Joaquín de Olmedo (GYE)', address: 'Av. de las Américas s/n, Guayaquil',
    airportCode: 'GYE', latitude: -2.157419, longitude: -79.883558, phone: '042000003', services: ['AIRPORT_COUNTER', 'SHUTTLE'], hours: AIRPORT_HOURS,
  },
  {
    id: 4, supplierId: 2, cityId: 2, name: 'Pacífico — Aeropuerto José Joaquín de Olmedo (GYE)', address: 'Av. de las Américas s/n, Guayaquil',
    airportCode: 'GYE', latitude: -2.157500, longitude: -79.883700, phone: '042000004', services: ['AIRPORT_COUNTER'], hours: AIRPORT_HOURS,
  },
  {
    id: 5, supplierId: 2, cityId: 2, name: 'Pacífico — Guayaquil Centro', address: 'Av. 9 de Octubre 100 y Malecón',
    airportCode: null, latitude: -2.194600, longitude: -79.882700, phone: '042000005', services: ['CITY_OFFICE', 'DELIVERY'], hours: CITY_HOURS,
  },
  {
    id: 6, supplierId: 2, cityId: 3, name: 'Pacífico — Aeropuerto Mariscal Lamar (CUE)', address: 'Av. España s/n, Cuenca',
    airportCode: 'CUE', latitude: -2.889470, longitude: -78.984397, phone: '072000006', services: ['AIRPORT_COUNTER'], hours: AIRPORT_HOURS,
  },
];

export const CATEGORIES = [
  { code: 'ECONOMY', name: 'Económico', minDriverAge: 21, sortOrder: 1, description: 'Autos pequeños y eficientes para la ciudad.' },
  { code: 'COMPACT', name: 'Compacto', minDriverAge: 21, sortOrder: 2, description: 'Más espacio sin perder eficiencia.' },
  { code: 'SEDAN', name: 'Sedán', minDriverAge: 23, sortOrder: 3, description: 'Confort para viajes largos.' },
  { code: 'SUV', name: 'SUV', minDriverAge: 23, sortOrder: 4, description: 'Altura, espacio y versatilidad.' },
  { code: 'PICKUP', name: 'Camioneta', minDriverAge: 25, sortOrder: 5, description: 'Carga y terrenos exigentes.' },
  { code: 'VAN', name: 'Van', minDriverAge: 25, sortOrder: 6, description: 'Para grupos grandes.' },
];

type ModelSeed = {
  key: string;
  /** Archivo en frontend/public/cars/ (créditos en /creditos). */
  image: string; supplierId: number; category: string; make: string; model: string; acriss: string;
  transmission: Transmission; fuelType: FuelType; seats: number; doors: number; bags: number;
  /** Unidades físicas por agencia. */
  units: Record<number, number>;
};

const A = Transmission.Automatic;
const M = Transmission.Manual;
const G = FuelType.Gasoline;
const D = FuelType.Diesel;
const H = FuelType.Hybrid;

export const VEHICLE_MODELS: ModelSeed[] = [
  { key: 'andes-picanto', image: 'kia-picanto', supplierId: 1, category: 'ECONOMY', make: 'Kia', model: 'Picanto', acriss: 'MBMR', transmission: M, fuelType: G, seats: 4, doors: 5, bags: 1, units: { 1: 2, 2: 2, 3: 1 } },
  { key: 'andes-onix', image: 'chevrolet-onix', supplierId: 1, category: 'COMPACT', make: 'Chevrolet', model: 'Onix', acriss: 'CDAR', transmission: A, fuelType: G, seats: 5, doors: 4, bags: 2, units: { 1: 2, 2: 1, 3: 2 } },
  { key: 'andes-corolla', image: 'toyota-corolla-hybrid', supplierId: 1, category: 'SEDAN', make: 'Toyota', model: 'Corolla Hybrid', acriss: 'IDAR', transmission: A, fuelType: H, seats: 5, doors: 4, bags: 3, units: { 1: 2, 3: 1 } },
  { key: 'andes-sportage', image: 'kia-sportage', supplierId: 1, category: 'SUV', make: 'Kia', model: 'Sportage', acriss: 'IFAR', transmission: A, fuelType: G, seats: 5, doors: 5, bags: 3, units: { 1: 2, 2: 1, 3: 1 } },
  { key: 'andes-hilux', image: 'toyota-hilux', supplierId: 1, category: 'PICKUP', make: 'Toyota', model: 'Hilux 4x4', acriss: 'FPMD', transmission: M, fuelType: D, seats: 5, doors: 4, bags: 4, units: { 1: 1, 3: 1 } },
  { key: 'pacif-accent', image: 'hyundai-accent', supplierId: 2, category: 'COMPACT', make: 'Hyundai', model: 'Accent', acriss: 'CDMR', transmission: M, fuelType: G, seats: 5, doors: 4, bags: 2, units: { 4: 2, 5: 2, 6: 1 } },
  { key: 'pacif-sentra', image: 'nissan-sentra', supplierId: 2, category: 'SEDAN', make: 'Nissan', model: 'Sentra', acriss: 'IDAR', transmission: A, fuelType: G, seats: 5, doors: 4, bags: 3, units: { 4: 2, 6: 1 } },
  { key: 'pacif-tucson', image: 'hyundai-tucson', supplierId: 2, category: 'SUV', make: 'Hyundai', model: 'Tucson', acriss: 'SFAR', transmission: A, fuelType: G, seats: 5, doors: 5, bags: 3, units: { 4: 1, 5: 1, 6: 1 } },
  { key: 'pacif-fortuner', image: 'toyota-fortuner', supplierId: 2, category: 'SUV', make: 'Toyota', model: 'Fortuner', acriss: 'FFAD', transmission: A, fuelType: D, seats: 7, doors: 5, bags: 4, units: { 4: 1, 5: 1 } },
  { key: 'pacif-h1', image: 'hyundai-h1', supplierId: 2, category: 'VAN', make: 'Hyundai', model: 'H-1', acriss: 'LVMD', transmission: M, fuelType: D, seats: 12, doors: 4, bags: 6, units: { 4: 1, 5: 1 } },
];

/** Tarifa diaria USD por proveedor y categoría. */
export const DAILY_RATES: Record<number, Record<string, number>> = {
  1: { ECONOMY: 32, COMPACT: 39, SEDAN: 52, SUV: 68, PICKUP: 85, VAN: 95 },
  2: { ECONOMY: 30, COMPACT: 36, SEDAN: 49, SUV: 72, PICKUP: 88, VAN: 92 },
};
export const RATE_VALIDITY = { validFrom: '2026-01-01', validTo: '2027-12-31' };

export const EXTRAS = [
  { code: 'GPS', name: 'Navegador GPS', type: ExtraType.Equipment, pricePerDay: 5, maxPrice: 35, description: 'Navegador con mapas de Ecuador.' },
  { code: 'CHILD_SEAT', name: 'Silla de bebé', type: ExtraType.Equipment, pricePerDay: 7, maxPrice: 49, description: 'Para niños de 9 a 18 kg.' },
  { code: 'ADDITIONAL_DRIVER', name: 'Conductor adicional', type: ExtraType.Service, pricePerDay: 8, maxPrice: 56, description: 'Un conductor adicional autorizado.' },
  { code: 'CDW', name: 'Cobertura total (CDW)', type: ExtraType.Coverage, pricePerDay: 12, maxPrice: null, description: 'Reduce el deducible por daños a $0.' },
  { code: 'WIFI', name: 'Wi-Fi portátil', type: ExtraType.Equipment, pricePerDay: 6, maxPrice: 42, description: 'Datos 4G ilimitados.' },
];

export const CURRENCY_RATES = [
  { currency: 'USD', rateFromUsd: 1 },
  { currency: 'EUR', rateFromUsd: 0.92 },
  { currency: 'GBP', rateFromUsd: 0.79 },
  { currency: 'COP', rateFromUsd: 4100 },
  { currency: 'PEN', rateFromUsd: 3.75 },
  { currency: 'MXN', rateFromUsd: 18.5 },
];

/** Afiliado de demostración para el Booking Hub (X-Affiliate-Id). */
export const AFFILIATES = [{ id: 1001, name: 'Booking Hub (demo)', commissionRate: 0.08, rateLimitPerMin: 300 }];

export const COLORS = ['Blanco', 'Gris plata', 'Negro', 'Rojo', 'Azul'];

/** Cliente OAuth2 (client_credentials) de demostración para el Booking Hub (emisor local RDA1). */
export const DEMO_API_CLIENT = {
  clientId: 'booking-hub-demo',
  name: 'Booking Hub (demo RDA1)',
  scopes: ['autos:read', 'autos:book', 'autos:cancel', 'autos:webhooks'],
  affiliateId: 1001,
};

/** Reseñas históricas (importadas, sin reserva asociada) para que /depots/reviews/scores tenga datos. Puntaje 1–10. */
export const SAMPLE_REVIEWS: { depotId: number; scores: number[] }[] = [
  { depotId: 1, scores: [9, 8, 9, 10, 8] },
  { depotId: 2, scores: [8, 7, 9] },
  { depotId: 3, scores: [9, 9, 8, 8] },
  { depotId: 4, scores: [7, 8, 8] },
  { depotId: 5, scores: [9, 10, 9] },
  { depotId: 6, scores: [8, 9] },
];
