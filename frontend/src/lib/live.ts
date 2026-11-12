/**
 * Refresco silencioso en segundo plano (polling): cada LIVE_REFRESH_MS se vuelven a pedir las órdenes y el estado de
 * la flota, sin loaders (React Query solo muestra "cargando" la primera vez y conserva los datos mientras refresca).
 * Así una cancelación hecha en Booking o una entrega de llaves en mostrador se ven sin recargar. Se pausa cuando la
 * pestaña no está visible (comportamiento por defecto de refetchInterval).
 */
export const LIVE_REFRESH_MS = 5_000
