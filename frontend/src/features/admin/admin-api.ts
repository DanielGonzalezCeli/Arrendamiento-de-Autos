import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../../lib/api'
import type { OrderStatus, RentalStatus } from '../../lib/types'

/** Tipos y hooks del panel de administración (API interna /api/admin, solo rol ADMIN). */

export interface Category { id: string; code: string; name: string; description: string | null; minDriverAge: number; sortOrder: number }
export interface Supplier { id: number; code: string; name: string; logoUrl: string | null; active: boolean }
export interface City { id: number; name: string; countryCode: string }

export interface VehicleModel {
  id: string
  supplierId: number
  categoryId: string
  make: string
  model: string
  acrissCode: string | null
  transmission: string
  fuelType: string
  fuelPolicy: string
  seats: number
  doors: number
  bagCapacity: number
  airConditioning: boolean
  imageUrl: string | null
  description: string | null
  published: boolean
  active: boolean
  category: Category
  supplier: Supplier
  units: number
  /** Por qué no aparece en la búsqueda; vacío = sí aparece. */
  searchIssues: string[]
}

export interface Depot {
  id: number
  supplierId: number
  cityId: number
  name: string
  address: string
  airportCode: string | null
  latitude: number
  longitude: number
  phone: string | null
  services: string[]
  active: boolean
  city: City
  supplier: Supplier
  openingHours: { weekday: number; opens: string; closes: string }[]
}

export interface FleetUnit {
  id: string
  vehicleModelId: string
  depotId: number
  plate: string
  year: number
  color: string | null
  mileage: number
  status: string
  active: boolean
  vehicleModel: VehicleModel
  depot: Depot
}

export interface VehicleBlock { id: string; startsAt: string; endsAt: string; reason: string }

export interface Extra {
  id: string
  code: string
  name: string
  description: string | null
  type: string
  pricePerDay: number
  maxPrice: number | null
  active: boolean
}

export interface Rate {
  id: string
  supplierId: number
  categoryId: string
  dailyRate: number
  currency: string
  validFrom: string
  validTo: string
  supplier: Supplier
  category: Category
}

export interface ReservationSummary {
  id: string
  locator: string
  status: OrderStatus
  rentalStatus: RentalStatus
  channel: 'WEB' | 'BOOKING_HUB'
  vehicle: string
  plate: string | null
  driver: string
  driverEmail: string
  pickupDepot: string
  pickupAt: string
  dropoffAt: string
  totalPrice: number
  currency: string
  createdAt: string
}

export interface HistoryEntry {
  id: string
  action: string
  actorSub: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  createdAt: string
}

export interface AdminReservation {
  id: string
  locator: string
  status: OrderStatus
  rentalStatus: RentalStatus
  channel: 'WEB' | 'BOOKING_HUB'
  ownerSub: string
  fleetUnitId: string | null
  pickupAt: string
  dropoffAt: string
  driverFirstName: string
  driverLastName: string
  driverEmail: string
  driverPhone: string | null
  driverAge: number
  vehicleSnapshot: { display_name?: string; plate?: string; image_url?: string }
  priceBreakdown: { lines: { code: string; description: string; quantity: number; unit_price: number; amount: number }[]; subtotal: number; tax: number; total: number }
  totalPrice: number
  currency: string
  paymentReference: string
  cancelledAt: string | null
  cancellationFee: number | null
  createdAt: string
  pickupDepot: Depot
  dropoffDepot: Depot
  history: HistoryEntry[]
  freeUnits: { id: string; plate: string; color: string | null; year: number; mileage: number }[]
  actions: { pickUp: boolean; return: boolean; cancel: boolean }
}

export interface Dashboard {
  pickups_today: number
  returns_today: number
  active_rentals: number
  upcoming: number
  overdue_returns: number
  web_last_30d: number
  hub_last_30d: number
  revenueThisMonth: { currency: string; amount: number }[]
  fleet: { status: string; units: number }[]
  webhooks: { failed: number; dead: number; pending_events: number }
  recentReservations: ReservationSummary[]
}

export interface AdminUser {
  id: string
  email: string
  firstName: string
  lastName: string
  phone: string | null
  role: 'ADMIN' | 'CUSTOMER'
  active: boolean
  createdAt: string
  reservations: number
}

export interface IntegrationOverview {
  clients: { clientId: string; name: string; scopes: string[]; affiliateId: number | null; active: boolean; createdAt: string }[]
  subscriptions: { id: string; ownerSub: string; url: string; events: string[]; active: boolean; createdAt: string; delivered: number; failed: number }[]
  deliveries: {
    id: string
    status: string
    attempt: number
    responseCode: number | null
    lastError: string | null
    nextAttemptAt: string | null
    deliveredAt: string | null
    createdAt: string
    eventType: string
    resourceId: string
    url: string
  }[]
  outbox: { pending: number; total: number }
}

const ADMIN = '/api/admin'

/** GET /api/admin/{path}; la clave de caché empieza por 'admin' para invalidar todo tras un cambio. */
export function useAdminQuery<T>(path: string, options: { refetchInterval?: number; enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['admin', path],
    queryFn: () => apiFetch<T>(`${ADMIN}/${path}`),
    ...options,
  })
}

type Method = 'POST' | 'PATCH' | 'DELETE'

/** Escritura en /api/admin; al terminar refresca todas las consultas del panel (y el catálogo público). */
export function useAdminMutation<TBody = unknown, TResult = unknown>(method: Method, path: string | ((body: TBody) => string)) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: TBody) => {
      const target = typeof path === 'function' ? path(body) : path
      return apiFetch<TResult>(`${ADMIN}/${target}`, { method, body: method === 'DELETE' ? undefined : stripId(body) })
    },
    onSuccess: () => queryClient.invalidateQueries(),
  })
}

/** El id viaja en la URL, no en el cuerpo (el backend rechaza propiedades desconocidas). */
function stripId(body: unknown) {
  if (body && typeof body === 'object' && 'id' in body) {
    const { id: _id, ...rest } = body as Record<string, unknown>
    return rest
  }
  return body
}

export const UNIT_STATUS_LABEL: Record<string, string> = {
  AVAILABLE: 'Disponible',
  MAINTENANCE: 'Mantenimiento',
  OUT_OF_SERVICE: 'Fuera de servicio',
  IN_USE: 'En alquiler',
}

export const CHANNEL_LABEL: Record<string, string> = { WEB: 'Web', BOOKING_HUB: 'Booking Hub' }
