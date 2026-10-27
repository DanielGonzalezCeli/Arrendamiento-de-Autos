/** Marca RutaLibre: una ruta que sube hacia un destino, con la línea central de carretera. */
export function LogoMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="var(--color-brand-800)" />
      <path d="M14 50 C 22 34, 42 40, 50 14" fill="none" stroke="var(--color-accent-400)" strokeWidth="7" strokeLinecap="round" />
      <path d="M14 50 C 22 34, 42 40, 50 14" fill="none" stroke="var(--color-brand-800)" strokeWidth="1.6" strokeDasharray="4 5" strokeLinecap="round" />
      <circle cx="50" cy="14" r="5" fill="#fff" />
    </svg>
  )
}

export function Logo({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className={`font-display text-xl font-bold tracking-tight ${tone === 'light' ? 'text-white' : 'text-asphalt-900'}`}>
        Ruta<span className="text-accent-500">Libre</span>
      </span>
    </span>
  )
}
