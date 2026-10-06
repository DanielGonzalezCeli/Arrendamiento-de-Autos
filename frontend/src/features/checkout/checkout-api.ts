import { apiFetch } from '../../lib/api'
import type { HoldResponse, PreviewResponse, Reservation } from '../../lib/types'

/** Endpoints de checkout de la API interna (mismos servicios que usa el Booking Hub). */

export function createHold(searchToken: string, vehicleId: string) {
  return apiFetch<HoldResponse>('/api/checkout/hold', { method: 'POST', body: { searchToken, vehicleId } })
}

export function createPreview(input: { searchToken: string; vehicleId: string; holdId?: string; extras: string[] }) {
  return apiFetch<PreviewResponse>('/api/checkout/preview', { method: 'POST', body: input })
}

export interface DriverInput {
  firstName: string
  lastName: string
  email: string
  phone?: string
}

/**
 * Paga (token de la pasarela simulada) y confirma. El Idempotency-Key es uno por intento de pago:
 * un doble clic o un reintento por error de red no cobran ni reservan dos veces.
 */
export function confirmReservation(orderPreviewId: string, driver: DriverInput, paymentToken: string, idempotencyKey: string) {
  return apiFetch<Reservation>('/api/checkout/confirm', {
    method: 'POST',
    body: { orderPreviewId, driver, paymentToken },
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}
