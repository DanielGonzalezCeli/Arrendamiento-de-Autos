import { useHealth } from './useHealth'

/**
 * Indicador del estado del backend y de la base de datos (evidencia del despliegue, C1).
 * Mientras la API de Render "despierta" se muestra como iniciando, no como caída.
 */
export function ApiStatusBadge() {
  const { data, isError, failureCount, fetchStatus } = useHealth()

  // Orden: reintentando (despertando) → falló todo → primera carga → respuesta recibida
  const state = failureCount > 0 && fetchStatus === 'fetching' ? 'waking'
    : isError ? 'offline'
      : !data ? 'connecting'
        : data.status === 'ok' ? 'online' : 'degraded'

  const { label, dot, title } = {
    connecting: { label: 'Conectando…', dot: 'bg-slate-400', title: 'Comprobando el estado del backend' },
    online: { label: 'API en línea', dot: 'bg-emerald-500', title: 'El backend y la base de datos responden' },
    waking: { label: 'Iniciando servidor…', dot: 'animate-pulse bg-amber-400', title: 'El servidor gratuito se estaba durmiendo; tarda ~50 s en despertar' },
    degraded: { label: 'API degradada', dot: 'bg-amber-500', title: 'El backend responde, pero la base de datos no' },
    offline: { label: 'API sin conexión', dot: 'bg-rose-500', title: 'No se pudo contactar al backend; se reintentará automáticamente' },
  }[state]

  return (
    <span title={title} role="status" className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600">
      <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
      {label}
    </span>
  )
}
