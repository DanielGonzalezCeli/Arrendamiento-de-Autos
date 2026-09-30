import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../../lib/api'
import type { Reservation } from '../../lib/types'

export function useMyReservations() {
  return useQuery({ queryKey: ['my-reservations'], queryFn: () => apiFetch<Reservation[]>('/api/me/reservations') })
}

export function useMyReservation(id: string | undefined) {
  return useQuery({ queryKey: ['my-reservations', id], queryFn: () => apiFetch<Reservation>(`/api/me/reservations/${id}`), enabled: !!id })
}

/** Tras modificar o cancelar se actualiza la caché con la respuesta del backend (fuente de verdad). */
function useReservationMutation<T>(request: (input: T) => Promise<Reservation>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: request,
    onSuccess: (reservation) => {
      queryClient.setQueryData(['my-reservations', reservation.id], reservation)
      queryClient.invalidateQueries({ queryKey: ['my-reservations'], exact: true })
    },
  })
}

export function useModifyExtras(id: string) {
  return useReservationMutation((changes: { extrasToAdd: string[]; extrasToRemove: string[] }) =>
    apiFetch<Reservation>(`/api/me/reservations/${id}/modify`, { method: 'POST', body: changes }))
}

export function useCancelReservation(id: string) {
  return useReservationMutation(() => apiFetch<Reservation>(`/api/me/reservations/${id}/cancel`, { method: 'POST' }))
}
