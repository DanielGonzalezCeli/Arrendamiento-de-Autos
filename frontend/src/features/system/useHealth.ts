import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../../lib/api'

interface HealthResponse {
  status: 'ok' | 'degraded'
  database: 'up' | 'down'
  timestamp: string
}

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => apiFetch<HealthResponse>('/health'),
    retry: 1,
  })
}
