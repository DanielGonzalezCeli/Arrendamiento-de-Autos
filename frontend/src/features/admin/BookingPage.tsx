import { ArrowUpRight, CalendarCheck, CheckCircle2, KeyRound, Radio, RefreshCw, Server, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, ErrorAlert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Spinner'
import { API_BASE_URL } from '../../lib/api'
import { formatDateTime, formatMoney, formatShortDateTime } from '../../lib/format'
import { StatusBadge } from '../reservations/StatusBadge'
import { useAdminMutation, useAdminQuery, type BookingOverview } from './admin-api'
import { Pill, SectionHeader, TD, Table } from './components'

/** Máquina de 6 estados del contrato v3, en el orden del ciclo de alquiler. */
const STATES: { key: string; label: string; color: string }[] = [
  { key: 'DISPONIBLE', label: 'Disponible', color: 'bg-emerald-500' },
  { key: 'RESERVADO', label: 'Reservado', color: 'bg-brand-500' },
  { key: 'LISTO_PARA_ENTREGAR', label: 'Listo para entregar', color: 'bg-sky-500' },
  { key: 'ENTREGADO', label: 'Entregado', color: 'bg-accent-500' },
  { key: 'EN_LIMPIEZA', label: 'En limpieza', color: 'bg-violet-400' },
  { key: 'EN_MANTENIMIENTO', label: 'En mantenimiento', color: 'bg-rose-400' },
]

const PUSHES_PREVIEW = 10

const MODE_LABEL: Record<string, string> = { grpc: 'gRPC (h2c)', http: 'HTTP (respaldo)', off: 'Desactivado' }

type SyncSummary = { checked: number; pushed: number; failed: number }

/** Monitor de la integración con Booking Prototipo: contrato v3 + PushStockUpdate del inventory.proto. */
export function BookingPage() {
  const data = useAdminQuery<BookingOverview>('booking', { refetchInterval: 10_000 })
  const sync = useAdminMutation<void, SyncSummary>('POST', 'booking/sync')
  const [report, setReport] = useState<SyncSummary | null>(null)
  const [showAll, setShowAll] = useState(false)

  if (data.isLoading) {
    return (
      <div className="flex flex-col gap-6" role="status" aria-label="Cargando la integración con Booking">
        <Skeleton className="h-9 w-80" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div>
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    )
  }
  if (data.error || !data.data) return <ErrorAlert error={data.error} />
  const { config, fleet, sync: state, pushes, orders } = data.data
  const baseUrl = `${API_BASE_URL}/api/v3`

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Booking Prototipo"
        subtitle="Contrato v3 (REST) y envío de stock por gRPC (inventory.proto · PushStockUpdate). Se actualiza cada 10 s."
        action={
          <Button variant="secondary" loading={sync.isPending} disabled={!config.stockClientActive} onClick={() => sync.mutate(undefined, { onSuccess: setReport })}>
            <RefreshCw className="h-4 w-4" /> Sincronizar stock ahora
          </Button>
        }
      />
      {report && (
        <Alert tone={report.failed ? 'error' : 'success'}>
          Reconciliación: {report.checked} autos revisados · {report.pushed} enviados · {report.failed} con error
          {report.pushed === 0 && report.failed === 0 && ' (Booking ya tenía el estado al día)'}
        </Alert>
      )}
      {sync.error && <ErrorAlert error={sync.error} />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card icon={<Server className="h-4 w-4" />} label="Nodo" value={config.nodeId}>
          {config.partnerName}
        </Card>
        <Card icon={<Radio className="h-4 w-4" />} label="Envío de stock" value={MODE_LABEL[config.stockMode] ?? config.stockMode} ok={config.stockClientActive}>
          <span className="break-all font-mono text-xs">{config.stockTarget ?? 'STOCK_SYNC_MODE=off'}</span>
        </Card>
        <Card icon={<KeyRound className="h-4 w-4" />} label="X-API-Key" value={config.apiKeyConfigured ? 'Configurada' : 'Sin configurar'} ok={config.apiKeyConfigured}>
          {config.apiKeyConfigured ? 'Reservas, cancelaciones y eventos exigen la clave.' : 'Define BOOKING_API_KEY en el servidor.'}
        </Card>
        <Card icon={<ArrowUpRight className="h-4 w-4" />} label="URL base para Booking" value="/api/v3">
          <a className="break-all font-mono text-xs text-brand-700 hover:underline" href={`${baseUrl}/health`} target="_blank" rel="noreferrer">{baseUrl}</a>
        </Card>
      </div>

      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg font-bold text-asphalt-900">Estado de la flota</h2>
          <p className="text-sm text-slate-500">{fleet.total} autos · máquina de 6 estados del contrato v3</p>
        </div>
        <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-stone-100" aria-hidden="true">
          {STATES.map((s) => fleet.states[s.key] ? (
            <div key={s.key} className={`${s.color} origin-left animate-[grow_0.8s_var(--ease-out-soft)_both]`} style={{ width: `${(fleet.states[s.key] / Math.max(fleet.total, 1)) * 100}%` }} />
          ) : null)}
        </div>
        <ul className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {STATES.map((s) => (
            <li key={s.key} className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.color}`} />
              <span className="whitespace-nowrap text-slate-600">{s.label}</span>
              <span className="ml-auto font-semibold text-asphalt-900 sm:ml-0">{fleet.states[s.key] ?? 0}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="flex items-center gap-2 font-semibold text-asphalt-900"><Radio className="h-4 w-4" /> Últimos envíos de stock (PushStockUpdate)</h2>
          <p className="text-sm text-slate-500">
            Confirmados por Booking: <b className="text-asphalt-900">{state.ok}</b> de {state.total}
            {state.failing > 0 && <> · <span className="text-rose-600">{state.failing} con error</span></>}
            {state.lastSyncedAt && <> · último acuse {formatShortDateTime(state.lastSyncedAt)}</>}
          </p>
        </div>
        <Table head={['Fecha', 'Auto', 'Stock', 'Franja', 'Canal', 'Resultado']} empty={!pushes.length}>
          {(showAll ? pushes : pushes.slice(0, PUSHES_PREVIEW)).map((p) => (
            <tr key={p.id}>
              <td className={`${TD} whitespace-nowrap text-xs`}>{formatDateTime(p.createdAt)}</td>
              <td className={`${TD} font-mono text-xs`}>{p.itemId}</td>
              <td className={TD}>
                <Pill tone={p.availableUnits === '0' ? 'blue' : 'green'}>{p.availableUnits === '0' ? '0 · no disponible' : `${p.availableUnits} · disponible`}</Pill>
              </td>
              <td className={`${TD} whitespace-nowrap text-xs`}>{p.date} {p.timeSlot}</td>
              <td className={`${TD} text-xs uppercase`}>{p.transport}</td>
              <td className={`${TD} text-xs`}>
                <Pill tone={p.success ? 'green' : 'red'}>{p.errorCode ?? (p.success ? 'OK' : 'ERROR')}</Pill>
                {!p.success && p.message && <p className="mt-1 max-w-xs truncate text-rose-600" title={p.message}>{p.message}</p>}
              </td>
            </tr>
          ))}
        </Table>
        {pushes.length > PUSHES_PREVIEW && (
          <button type="button" className="mt-2 text-sm font-medium text-brand-700 hover:underline" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Ver menos' : `Ver los ${pushes.length} envíos más recientes`}
          </button>
        )}
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-asphalt-900"><CalendarCheck className="h-4 w-4" /> Reservas recibidas de Booking</h2>
        <Table head={['PNR', 'Vehículo', 'Conductor', 'Alquiler', 'Total', 'Estado']} empty={!orders.length}>
          {orders.map((o) => (
            <tr key={o.id}>
              <td className={TD}>
                <Link to={`/admin/reservas/${o.id}`} className="rounded-md bg-asphalt-900 px-2 py-0.5 font-mono text-xs font-bold tracking-wider text-accent-300 hover:bg-asphalt-700">{o.locator}</Link>
              </td>
              <td className={TD}><p className="font-medium">{o.vehicle}</p><p className="font-mono text-xs text-slate-500">{o.plate ?? '—'}</p></td>
              <td className={TD}>{o.driver}</td>
              <td className={`${TD} whitespace-nowrap text-xs`}>{formatShortDateTime(o.pickupAt)}<p className="text-slate-500">→ {formatShortDateTime(o.dropoffAt)}</p></td>
              <td className={`${TD} whitespace-nowrap font-semibold`}>{formatMoney(o.totalPrice, o.currency)}</td>
              <td className={TD}><StatusBadge status={o.status} rentalStatus={o.rentalStatus} /></td>
            </tr>
          ))}
        </Table>
      </section>
    </div>
  )
}

function Card({ icon, label, value, ok, children }: { icon: React.ReactNode; label: string; value: string; ok?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex animate-rise flex-col gap-1 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-400 uppercase">{icon} {label}</p>
      <p className="flex items-center gap-1.5 font-display text-lg font-bold text-asphalt-900">
        {value}
        {ok === true && <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-label="activo" />}
        {ok === false && <TriangleAlert className="h-4 w-4 text-amber-500" aria-label="revisar" />}
      </p>
      <div className="text-sm text-slate-500">{children}</div>
    </div>
  )
}
