/**
 * Ilustración SVG por categoría (el catálogo de demo no tiene fotos). Si el modelo tiene imageUrl,
 * se muestra la foto; si no, una silueta coloreada según la categoría.
 */
const PALETTE: Record<string, { from: string; to: string; body: string }> = {
  ECONOMY: { from: '#e0f2fe', to: '#bae6fd', body: '#0284c7' },
  COMPACT: { from: '#dcfce7', to: '#bbf7d0', body: '#16a34a' },
  SEDAN: { from: '#ede9fe', to: '#ddd6fe', body: '#7c3aed' },
  SUV: { from: '#ffedd5', to: '#fed7aa', body: '#ea580c' },
  PICKUP: { from: '#fef9c3', to: '#fde68a', body: '#b45309' },
  VAN: { from: '#fce7f3', to: '#fbcfe8', body: '#db2777' },
}
const DEFAULT = { from: '#f1f5f9', to: '#e2e8f0', body: '#475569' }

export function CarIllustration({ category, imageUrl, alt, className = '' }: { category: string; imageUrl?: string | null; alt: string; className?: string }) {
  if (imageUrl) return <img src={imageUrl} alt={alt} className={`h-full w-full object-cover ${className}`} loading="lazy" />

  const colors = PALETTE[category] ?? DEFAULT
  const tall = category === 'SUV' || category === 'PICKUP' || category === 'VAN'
  return (
    // El degradado va en el contenedor (siempre lo llena); la silueta se escala completa y centrada.
    <div
      role="img"
      aria-label={alt}
      className={`flex h-full w-full items-center justify-center ${className}`}
      style={{ background: `linear-gradient(135deg, ${colors.from}, ${colors.to})` }}
    >
      <svg viewBox="0 20 320 150" className="h-full max-h-56 w-full max-w-sm p-4" aria-hidden="true">
        <ellipse cx="160" cy="146" rx="120" ry="8" fill="#0f172a" opacity="0.12" />
        {tall ? (
          <path d="M50 128 L58 88 Q62 72 80 70 L120 62 Q132 42 160 42 L214 42 Q236 42 246 62 L262 72 Q276 76 276 92 L276 128 Z" fill={colors.body} />
        ) : (
          <path d="M40 130 L46 104 Q50 92 66 90 L106 84 Q126 58 160 58 L196 58 Q222 58 238 80 L268 90 Q282 94 282 110 L282 130 Z" fill={colors.body} />
        )}
        <path
          d={tall ? 'M128 70 Q138 52 160 52 L208 52 Q226 52 234 70 Z' : 'M118 86 Q134 68 160 68 L192 68 Q212 68 226 86 Z'}
          fill="#ffffff"
          opacity="0.55"
        />
        <circle cx={tall ? 92 : 88} cy="130" r="20" fill="#1e293b" />
        <circle cx={tall ? 92 : 88} cy="130" r="8" fill="#cbd5e1" />
        <circle cx="236" cy="130" r="20" fill="#1e293b" />
        <circle cx="236" cy="130" r="8" fill="#cbd5e1" />
      </svg>
    </div>
  )
}
