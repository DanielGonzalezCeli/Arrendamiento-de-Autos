import { useHealth } from './useHealth'

/** Indicador visible del estado del backend y de la base de datos (útil para verificar el despliegue). */
export function ApiStatusBadge() {
  const { data, isLoading, isError } = useHealth()

  const online = data?.status === 'ok'
  const label = isLoading ? 'Conectando…' : isError ? 'API sin conexión' : online ? 'API en línea' : 'API degradada'
  const dot = isLoading ? 'bg-slate-400' : online ? 'bg-emerald-500' : 'bg-rose-500'

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600">
      <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
      {label}
    </span>
  )
}
