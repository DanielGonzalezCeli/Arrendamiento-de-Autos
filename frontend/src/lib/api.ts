/**
 * Cliente HTTP del frontend. El frontend solo habla con NUESTRO backend (API interna),
 * nunca con la base de datos ni con servicios de terceros.
 */
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')

/** Error con el formato ProblemDetails (RFC 7807) que devuelve el backend. */
export class ApiError extends Error {
  readonly status: number
  readonly code?: string

  constructor(status: number, title: string, code?: string) {
    super(title)
    this.status = status
    this.code = code
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  })
  const body = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) {
    throw new ApiError(response.status, body?.title ?? body?.detail ?? response.statusText, body?.code)
  }
  return body as T
}
