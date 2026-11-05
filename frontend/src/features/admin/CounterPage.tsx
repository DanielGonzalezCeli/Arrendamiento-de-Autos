import { KeyRound, Search } from 'lucide-react'
import { useDeferredValue, useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorAlert } from '../../components/ui/Alert'
import { ButtonLink } from '../../components/ui/Button'
import { INPUT_CLASS } from '../../components/ui/Field'
import { LoadingBlock } from '../../components/ui/Spinner'
import { formatShortDateTime } from '../../lib/format'
import { StatusBadge } from '../reservations/StatusBadge'
import { useAdminQuery, type ReservationSummary } from './admin-api'
import { Pill, SectionHeader } from './components'

/** Se refresca solo: una reserva hecha desde Booking aparece sin recargar la página. */
const REFRESH_MS = 10_000

/** Estado para el mostrador (contrato v3.1): RESERVADO → CONFIRMADO_ASISTIDO al entregar las llaves. */
function counterState(r: ReservationSummary) {
  if (r.status === 'CONFIRMED' && r.rentalStatus === 'NOT_STARTED') return <Pill tone="amber">RESERVADO · pendiente de entrega</Pill>
  if (r.rentalStatus === 'PICKED_UP') return <Pill tone="green">ENTREGADO · CONFIRMADO_ASISTIDO</Pill>
  return <StatusBadge status={r.status} rentalStatus={r.rentalStatus} />
}

/** Mostrador: el operador busca la reserva del cliente que llegó y confirma la entrega de llaves (check-in). */
export function CounterPage() {
  const [q, setQ] = useState('')
  const term = useDeferredValue(q.trim())
  const path = term.length >= 3
    ? `reservations?q=${encodeURIComponent(term)}`
    : 'reservations?status=CONFIRMED&rentalStatus=NOT_STARTED'
  const { data, isLoading, error } = useAdminQuery<ReservationSummary[]>(path, { refetchInterval: REFRESH_MS })
  const rows = term.length >= 3 ? data : data?.slice().sort((a, b) => a.pickupAt.localeCompare(b.pickupAt)).slice(0, 20)

  return (
    <div>
      <SectionHeader title="Mostrador" subtitle="Busca la reserva del cliente que llegó a retirar el auto y confirma la entrega de llaves. Si la reserva vino de Booking, se le avisa el check-in." />
      <label className="relative mb-5 block">
        <span className="sr-only">Buscar reserva</span>
        <Search className="pointer-events-none absolute left-4 top-4 h-5 w-5 text-slate-400" />
        <input autoFocus className={`${INPUT_CLASS} h-14 pl-12 text-base`} placeholder="Código de reserva, cédula / identificación o correo"
          value={q} onChange={(e) => setQ(e.target.value)} maxLength={80} />
      </label>

      <p className="mb-2 text-sm text-slate-500">
        {term.length >= 3 ? `Resultados para “${term}”` : 'Próximas entregas pendientes'} · se actualiza cada {REFRESH_MS / 1000} s
      </p>
      {isLoading ? <LoadingBlock /> : error ? <ErrorAlert error={error} /> : !rows?.length ? (
        <p className="rounded-2xl border border-dashed border-stone-300 p-8 text-center text-sm text-slate-500">
          {term.length >= 3 ? 'No hay reservas con ese código, identificación o correo.' : 'No hay entregas pendientes.'}
        </p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <Link to={`/admin/reservas/${r.id}`} className="font-mono text-lg font-bold text-brand-700 hover:underline">{r.locator}</Link>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {counterState(r)}
                    {r.fromBooking && <Pill tone="blue">Booking</Pill>}
                  </div>
                </div>
                <p className="text-right text-xs text-slate-500">Retiro<span className="block text-sm font-semibold text-asphalt-900">{formatShortDateTime(r.pickupAt)}</span></p>
              </div>
              <div className="text-sm text-slate-600">
                <p className="font-semibold text-asphalt-900">{r.driver}</p>
                <p>{r.identification ? <>Identificación <span className="font-mono">{r.identification}</span> · </> : null}{r.driverEmail}</p>
                <p>{r.vehicle.replace(/ o similar$/, '')}{r.plate ? <> · <span className="font-mono">{r.plate}</span></> : null} · {r.pickupDepot}</p>
              </div>
              {r.status === 'CONFIRMED' && r.rentalStatus === 'NOT_STARTED' && (
                <ButtonLink to={`/admin/reservas/${r.id}?checkin=1`} className="self-start">
                  <KeyRound className="h-4 w-4" /> Confirmar entrega de llaves / Check-in
                </ButtonLink>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
