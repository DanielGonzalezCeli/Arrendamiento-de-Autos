import type { ReactNode } from 'react'

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-2xl border border-stone-200/80 bg-white shadow-[0_1px_2px_rgb(12_21_24/0.04)] ${className}`}>{children}</div>
}

export function PageContainer({ title, subtitle, actions, eyebrow, children }: {
  title?: string; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: string; children: ReactNode
}) {
  return (
    <div className="mx-auto w-full max-w-6xl animate-fade px-4 py-8 md:py-10">
      {title && (
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            {eyebrow && <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-accent-600">{eyebrow}</p>}
            <h1 className="text-2xl font-bold text-asphalt-900 md:text-3xl">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </div>
  )
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex animate-pop flex-col items-center gap-3 rounded-2xl border border-dashed border-stone-300 bg-white/70 px-6 py-14 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-full bg-brand-50 text-brand-600">{icon}</div>
      <h2 className="text-lg font-semibold text-asphalt-900">{title}</h2>
      <div className="road-line w-16" aria-hidden="true" />
      {children && <div className="max-w-md text-sm text-slate-500">{children}</div>}
      {action}
    </div>
  )
}
