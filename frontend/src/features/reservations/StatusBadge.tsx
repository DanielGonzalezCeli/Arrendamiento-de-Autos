import type { OrderStatus, RentalStatus } from '../../lib/types'

const LABELS: Record<string, { text: string; className: string }> = {
  CONFIRMED: { text: 'Confirmada', className: 'bg-emerald-50 text-emerald-700 before:bg-emerald-500' },
  PENDING: { text: 'Pendiente', className: 'bg-amber-50 text-amber-700 before:bg-amber-500' },
  CANCELLED: { text: 'Cancelada', className: 'bg-stone-100 text-slate-600 before:bg-slate-400' },
  PICKED_UP: { text: 'En curso', className: 'bg-brand-50 text-brand-700 before:bg-brand-500 before:animate-pulse' },
  RETURNED: { text: 'Finalizada', className: 'bg-stone-100 text-slate-600 before:bg-slate-400' },
}

/** Estado visible: el operativo (en curso / finalizada) prevalece sobre el comercial si ya empezó. */
export function StatusBadge({ status, rentalStatus }: { status: OrderStatus; rentalStatus: RentalStatus }) {
  const key = status === 'CONFIRMED' && rentalStatus !== 'NOT_STARTED' ? rentalStatus : status
  const { text, className } = LABELS[key]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold before:h-1.5 before:w-1.5 before:rounded-full ${className}`}>
      {text}
    </span>
  )
}
