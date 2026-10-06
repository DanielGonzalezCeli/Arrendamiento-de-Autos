import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../../lib/api'

interface HealthResponse {
  status: 'ok' | 'degraded'
  database: 'up' | 'down'
  timestamp: string
}

/** Reintentos durante ~2 min: el plan gratuito de Render apaga la API tras 15 min sin uso y tarda ~50 s en despertar. */
const WAKE_UP_RETRIES = 8
const CHECK_EVERY_MS = 60_000

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => apiFetch<HealthResponse>('/health'),
    retry: WAKE_UP_RETRIES,
    retryDelay: (attempt) => Math.min(5_000 * (attempt + 1), 20_000),
    // Se vuelve a comprobar solo: un fallo pasajero no deja el indicador congelado en "sin conexión"
    refetchInterval: CHECK_EVERY_MS,
    refetchOnWindowFocus: true,
    staleTime: 0,
  })
}
