/** Tipos de las respuestas de la API interna (/api). Reflejan los mappers del backend. */

export type Role = 'CUSTOMER' | 'ADMIN'

export interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  phone: string | null
  role: Role
}

export interface AuthResponse {
  accessToken: string
  tokenType: 'Bearer'
  user: User
}

export interface OpeningHours {
  weekday: number
  opens: string
  closes: string
}

export interface Depot {
  id: number
  name: string
  address: string
  airportCode: string | null
  city?: { id: number; name: string }
  supplier?: { id: number; name: string }
  latitude: number
  longitude: number
  services: string[]
  openingHours: OpeningHours[]
}

export interface LocationCity {
  id: number
  name: string
  airports: string[]
  depots: Depot[]
}

export type Transmission = 'MANUAL' | 'AUTOMATIC'

export interface Vehicle {
  id: string
  make: string
  model: string
  displayName: string
  category: { code: string; name: string; minDriverAge: number }
  supplier: { id: number; name: string }
  transmission: Transmission
  fuelType: string
  fuelPolicy: string
  seats: number
  doors: number
  bagCapacity: number
  airConditioning: boolean
  acrissCode: string | null
  imageUrl: string | null
  description: string | null
}

export interface PriceLine {
  code: string
  description: string
  quantity: number
  unit_price: number
  amount: number
}

/** Desglose de precio calculado por el backend (el frontend solo lo muestra). */
export interface PriceBreakdown {
  currency: string
  rental_days: number
  lines: PriceLine[]
  subtotal: number
  tax_rate: number
  tax: number
  total: number
}

export interface Offer {
  vehicle: Vehicle
  pickupDepot: Depot
  dropoffDepot: Depot
  oneWay: boolean
  availableUnits: number
  price: PriceBreakdown
}

export interface SearchResult {
  searchToken: string
  expiresAt: string
  currency: string
  pickupAt: string
  dropoffAt: string
  total: number
  offers: Offer[]
}

export interface Category {
  code: string
  name: string
  description: string | null
  minDriverAge: number
}

export interface Extra {
  code: string
  name: string
  description: string | null
  type: 'EQUIPMENT' | 'COVERAGE' | 'SERVICE'
  pricePerDay: number
  maxPrice: number | null
}

export interface HoldResponse {
  holdId: string
  expiresAt: string
}

export interface PreviewResponse {
  orderPreviewId: string
  expiresAt: string
  holdId: string | null
  price: PriceBreakdown
}

export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED'
export type RentalStatus = 'NOT_STARTED' | 'PICKED_UP' | 'RETURNED'

/** Snapshot del vehículo guardado en la reserva (claves snake_case, igual que en el contrato). */
export interface VehicleSnapshot {
  vehicle_id: string
  display_name: string
  make: string
  model: string
  category: { code: string; name: string }
  transmission: Transmission
  fuel_type: string
  seats: number
  doors: number
  bag_capacity: number
  supplier: { supplier_id: number; name: string; code: string }
  plate?: string
}

export interface RouteEndpoint {
  depot_id: number
  name: string
  address: string
  datetime: string
}

export interface RouteSnapshot {
  pickup: RouteEndpoint
  dropoff: RouteEndpoint
  one_way: boolean
  rental_days: number
}

export interface Reservation {
  id: string
  locator: string
  status: OrderStatus
  rentalStatus: RentalStatus
  channel: 'WEB' | 'BOOKING_HUB'
  createdAt: string
  pickupAt: string
  dropoffAt: string
  vehicle: VehicleSnapshot
  route: RouteSnapshot
  price: PriceBreakdown
  totalPrice: number
  currency: string
  extras: { code: string; name: string; subtotal: number }[]
  driver: { firstName: string; lastName: string; email: string; phone: string | null }
  cancelledAt: string | null
  cancellationFee: number | null
  canModify: boolean
  canCancel: boolean
}
