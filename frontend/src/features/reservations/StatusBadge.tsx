import type { OrderStatus, RentalStatus } from '../../lib/types'

const LABELS: Record<string, { text: string; className: string }> = {
  CONFIRMED: { text: 'Confirmada', className: 'bg-emerald-50 text-emerald-700' },
  PENDING: { text: 'Pendiente', className: 'bg-amber-50 text-amber-700' },
  CANCELLED: { text: 'Cancelada', className: 'bg-slate-100 text-slate-600' },
  PICKED_UP: { text: 'En curso', className: 'bg-brand-50 text-brand-700' },
  RETURNED: { text: 'Finalizada', className: 'bg-slate-100 text-slate-600' },
}

/** Estado visible: el operativo (en curso / finalizada) prevalece sobre el comercial si ya empezó. */
export function StatusBadge({ status, rentalStatus }: { status: OrderStatus; rentalStatus: RentalStatus }) {
  const key = status === 'CONFIRMED' && rentalStatus !== 'NOT_STARTED' ? rentalStatus : status
  const { text, className } = LABELS[key]
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}>{text}</span>
}
