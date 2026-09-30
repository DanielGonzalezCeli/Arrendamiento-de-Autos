import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../../lib/api'
import { writeSession, readSession } from '../../lib/session-store'
import type { Category, Extra, LocationCity, SearchResult, Vehicle } from '../../lib/types'
import { criteriaToApiBody, type SearchCriteria } from '../search/search-criteria'

const CATALOG_STALE_MS = 10 * 60_000
/** El search_token vive 30 min en el backend: se reutiliza el resultado hasta 20 min. */
const SEARCH_STALE_MS = 20 * 60_000
const LAST_SEARCH_KEY = 'rutalibre.lastSearch'

export function useLocations() {
  return useQuery({ queryKey: ['locations'], queryFn: () => apiFetch<LocationCity[]>('/api/locations'), staleTime: CATALOG_STALE_MS })
}

export function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: () => apiFetch<Category[]>('/api/categories'), staleTime: CATALOG_STALE_MS })
}

export function useExtras() {
  return useQuery({ queryKey: ['extras'], queryFn: () => apiFetch<Extra[]>('/api/extras'), staleTime: CATALOG_STALE_MS })
}

export function useVehicle(id: string | undefined) {
  return useQuery({ queryKey: ['vehicle', id], queryFn: () => apiFetch<Vehicle>(`/api/vehicles/${id}`), enabled: !!id, staleTime: CATALOG_STALE_MS })
}

export interface LastSearch {
  criteria: SearchCriteria
  result: SearchResult
}

/**
 * Búsqueda (POST /api/search). El resultado se guarda en sessionStorage para que el detalle y el
 * checkout conozcan la oferta (precio, agencias, search_token) aunque se recargue la página.
 */
export function useSearch(criteria: SearchCriteria | null) {
  return useQuery({
    queryKey: ['search', criteria],
    enabled: !!criteria,
    staleTime: SEARCH_STALE_MS,
    retry: false,
    queryFn: async () => {
      const result = await apiFetch<SearchResult>('/api/search', { method: 'POST', body: criteriaToApiBody(criteria!) })
      writeSession(LAST_SEARCH_KEY, { criteria: criteria!, result } satisfies LastSearch)
      return result
    },
  })
}

export function readLastSearch(): LastSearch | null {
  return readSession<LastSearch>(LAST_SEARCH_KEY)
}
