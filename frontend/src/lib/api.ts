/**
 * Cliente HTTP del frontend. El frontend solo habla con NUESTRO backend (API interna),
 * nunca con la base de datos ni con servicios de terceros.
 */
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')

export interface InvalidParam {
  name: string
  reason: string
}

/** Error con el formato ProblemDetails (RFC 7807) que devuelve el backend. */
export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly invalidParams: InvalidParam[]

  constructor(status: number, message: string, code?: string, invalidParams: InvalidParam[] = []) {
    super(message)
    this.status = status
    this.code = code
    this.invalidParams = invalidParams
  }

  /** Motivo del error para un campo concreto (para mostrarlo junto al input). */
  fieldError(name: string): string | undefined {
    return this.invalidParams.find((p) => p.name === name)?.reason
  }
}

let accessToken: string | null = null
let onUnauthorized: (() => void) | null = null

/** Lo configura AuthProvider: token actual y qué hacer si el backend responde 401. */
export function configureAuth(token: string | null, unauthorizedHandler: (() => void) | null): void {
  accessToken = token
  onUnauthorized = unauthorizedHandler
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  headers?: Record<string, string>
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })

  const text = await response.text()
  const body = text ? JSON.parse(text) : null

  if (!response.ok) {
    if (response.status === 401 && accessToken) onUnauthorized?.()
    const message = body?.detail ?? body?.title ?? `Error ${response.status}`
    throw new ApiError(response.status, message, body?.code, body?.invalidParams ?? [])
  }
  return body as T
}

/** Subida de archivos (multipart). El navegador pone el Content-Type con el boundary. */
export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    body: form,
  })
  const text = await response.text()
  const body = text ? JSON.parse(text) : null
  if (!response.ok) {
    if (response.status === 401 && accessToken) onUnauthorized?.()
    throw new ApiError(response.status, body?.detail ?? body?.title ?? `Error ${response.status}`, body?.code, body?.invalidParams ?? [])
  }
  return body as T
}

/** Las fotos subidas se sirven desde la API (/api/images/…); las de demo, desde la web (/cars/…). */
export function assetUrl(url: string): string {
  return url.startsWith('/api/') ? `${API_BASE_URL}${url}` : url
}

/** Mensaje amigable para mostrar al usuario a partir de cualquier error. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof TypeError) return 'No se pudo conectar con el servidor. Si es la primera visita, espera unos segundos e inténtalo de nuevo.'
  return 'Ocurrió un error inesperado.'
}
