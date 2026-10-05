import { Search } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorAlert } from '../../components/ui/Alert'
import { INPUT_CLASS } from '../../components/ui/Field'
import { LoadingBlock } from '../../components/ui/Spinner'
import { depotLabel } from '../../lib/depots'
import { formatMoney, formatShortDateTime } from '../../lib/format'
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
      <div className="mb-4 flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="relative min-w-0 flex-[2_1_16rem]">
          <span className="sr-only">Buscar</span>
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input className={`${INPUT_CLASS} pl-9`} placeholder="Localizador, correo o apellido" value={q} onChange={(e) => setQ(e.target.value)} maxLength={80} />
        </label>
        <select aria-label="Estado" className={`${INPUT_CLASS} min-w-0 flex-[1_1_10rem]`} value={state} onChange={(e) => setState(e.target.value)}>
          {STATES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select aria-label="Agencia de recogida" className={`${INPUT_CLASS} min-w-0 flex-[1_1_14rem]`} value={depotId} onChange={(e) => setDepotId(e.target.value)}>
          <option value="">Todas las agencias</option>
          {depots.data?.map((d) => <option key={d.id} value={d.id}>{depotLabel(d)}</option>)}
        </select>
        <div className="flex min-w-0 flex-[2_1_20rem] items-center gap-2">
          <span className="shrink-0 text-xs font-medium text-slate-500">Recogida</span>
          <input aria-label="Recogida desde" type="date" className={`${INPUT_CLASS} min-w-0`} value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="text-slate-400">–</span>
          <input aria-label="Recogida hasta" type="date" className={`${INPUT_CLASS} min-w-0`} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {isLoading ? <LoadingBlock /> : error ? <ErrorAlert error={error} /> : (
        <>
          <p className="mb-2 text-sm text-slate-500">{data?.length ?? 0} reserva(s){data?.length === 200 ? ' (se muestran las 200 más recientes por fecha de recogida)' : ''}</p>
          <Table head={['Reserva', 'Vehículo', 'Conductor', { label: 'Agencia de recogida', className: 'hidden xl:table-cell' }, 'Fechas', 'Estado', 'Total']} empty={!data?.length}>
            {data?.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className={`${TD} whitespace-nowrap`}>
                  <Link to={`/admin/reservas/${r.id}`} className="font-mono font-semibold text-brand-700 hover:underline">{r.locator}</Link>
                  <span className="block text-xs text-slate-500">{CHANNEL_LABEL[r.channel]}</span>
                </td>
                <td className={`${TD} min-w-[11rem] xl:min-w-0`}>{r.vehicle.replace(/ o similar$/, '')}{r.plate && <span className="block font-mono text-xs text-slate-500">{r.plate}</span>}
                  <span className="block text-xs text-slate-500 xl:hidden">{depotLabel({ name: r.pickupDepot })}</span>
                </td>
                <td className={TD}>{r.driver}<span className="block max-w-[9rem] truncate text-xs text-slate-500 xl:max-w-[14rem]" title={r.driverEmail}>{r.driverEmail}</span></td>
                <td className={`${TD} hidden max-w-[15rem] xl:table-cell`}>{depotLabel({ name: r.pickupDepot })}</td>
                <td className={`${TD} whitespace-nowrap text-xs`}>
                  <span className="block"><span className="text-slate-400">Recoge </span>{formatShortDateTime(r.pickupAt)}</span>
                  <span className="block"><span className="text-slate-400">Devuelve </span>{formatShortDateTime(r.dropoffAt)}</span>
                </td>
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
