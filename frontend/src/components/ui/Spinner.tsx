export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const dimension = size === 'sm' ? 'h-4 w-4 border-2' : 'h-8 w-8 border-[3px]'
  return (
    <span
      role="status"
      aria-label="Cargando"
      className={`inline-block animate-spin rounded-full border-current border-t-transparent ${dimension}`}
    />
  )
}

/** Carga con la línea de carretera en movimiento (identidad de la marca). */
export function LoadingBlock({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div role="status" className="flex animate-fade flex-col items-center justify-center gap-4 py-16">
      <svg viewBox="0 0 120 12" className="w-28" aria-hidden="true">
        <line x1="0" y1="6" x2="120" y2="6" stroke="var(--color-brand-700)" strokeWidth="12" strokeLinecap="round" />
        <line x1="6" y1="6" x2="114" y2="6" stroke="var(--color-accent-400)" strokeWidth="2.5" strokeDasharray="12 12" className="animate-road" />
      </svg>
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  )
}

/** Bloque gris con brillo mientras llegan los datos. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />
}
