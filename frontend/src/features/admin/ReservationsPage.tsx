import { Search } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorAlert } from '../../components/ui/Alert'
import { INPUT_CLASS } from '../../components/ui/Field'
import { LoadingBlock } from '../../components/ui/Spinner'
import { formatDateTime, formatMoney } from '../../lib/format'
import { StatusBadge } from '../reservations/StatusBadge'
import { CHANNEL_LABEL, useAdminQuery, type Depot, type ReservationSummary } from './admin-api'
import { SectionHeader, TD, Table } from './components'

const STATES = [
  { value: '', label: 'Todos los estados' },
  { value: 'status=CONFIRMED&rentalStatus=NOT_STARTED', label: 'Por entregar' },
  { value: 'rentalStatus=PICKED_UP', label: 'En curso' },
  { value: 'rentalStatus=RETURNED', label: 'Finalizadas' },
  { value: 'status=CANCELLED', label: 'Canceladas' },
]

export function ReservationsPage() {
  const [q, setQ] = useState('')
  const [state, setState] = useState('')
  const [depotId, setDepotId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const params = new URLSearchParams(state)
  if (q.trim()) params.set('q', q.trim())
  if (depotId) params.set('depotId', depotId)
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  const query = params.toString()

  const depots = useAdminQuery<Depot[]>('depots')
  const { data, isLoading, error } = useAdminQuery<ReservationSummary[]>(`reservations${query ? `?${query}` : ''}`)

  return (
    <div>
      <SectionHeader title="Reservas" subtitle="Reservas del marketplace y del Booking Hub. Desde el detalle se registra la entrega y la devolución." />
      <div className="mb-4 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
        <label className="relative lg:col-span-2">
          <span className="sr-only">Buscar</span>
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input className={`${INPUT_CLASS} pl-9`} placeholder="Localizador, correo o apellido" value={q} onChange={(e) => setQ(e.target.value)} maxLength={80} />
        </label>
        <select aria-label="Estado" className={INPUT_CLASS} value={state} onChange={(e) => setState(e.target.value)}>
          {STATES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select aria-label="Agencia de recogida" className={INPUT_CLASS} value={depotId} onChange={(e) => setDepotId(e.target.value)}>
          <option value="">Todas las agencias</option>
          {depots.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <div className="flex gap-2">
          <input aria-label="Recogida desde" type="date" className={INPUT_CLASS} value={from} onChange={(e) => setFrom(e.target.value)} />
          <input aria-label="Recogida hasta" type="date" className={INPUT_CLASS} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {isLoading ? <LoadingBlock /> : error ? <ErrorAlert error={error} /> : (
        <>
          <p className="mb-2 text-sm text-slate-500">{data?.length ?? 0} reserva(s){data?.length === 200 ? ' (se muestran las 200 más recientes por fecha de recogida)' : ''}</p>
          <Table head={['Localizador', 'Vehículo / placa', 'Conductor', 'Agencia', 'Recogida', 'Devolución', 'Canal', 'Estado', 'Total']} empty={!data?.length}>
            {data?.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className={TD}><Link to={`/admin/reservas/${r.id}`} className="font-mono font-semibold text-brand-700 hover:underline">{r.locator}</Link></td>
                <td className={TD}>{r.vehicle}{r.plate && <span className="block font-mono text-xs text-slate-500">{r.plate}</span>}</td>
                <td className={TD}>{r.driver}<span className="block text-xs text-slate-500">{r.driverEmail}</span></td>
                <td className={TD}>{r.pickupDepot}</td>
                <td className={`${TD} whitespace-nowrap`}>{formatDateTime(r.pickupAt)}</td>
                <td className={`${TD} whitespace-nowrap`}>{formatDateTime(r.dropoffAt)}</td>
                <td className={TD}>{CHANNEL_LABEL[r.channel]}</td>
                <td className={TD}><StatusBadge status={r.status} rentalStatus={r.rentalStatus} /></td>
                <td className={`${TD} whitespace-nowrap text-right font-medium`}>{formatMoney(r.totalPrice, r.currency)}</td>
              </tr>
            ))}
          </Table>
        </>
      )}
    </div>
  )
}
