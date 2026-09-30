/**
 * Acceso seguro a sessionStorage (puede no estar disponible: modo privado, bloqueo de cookies…).
 * Solo guarda datos de conveniencia de la pestaña; la fuente de verdad es siempre el backend.
 */
export function readSession<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function writeSession(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    // sin almacenamiento: la app sigue funcionando, solo se pierde al recargar
  }
}

export function removeSession(key: string): void {
  try {
    sessionStorage.removeItem(key)
  } catch {
    // ignorar
  }
}
