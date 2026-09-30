import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, CalendarClock, CarFront, DollarSign, Globe, Network } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ErrorAlert } from '../../components/ui/Alert'
import { LoadingBlock } from '../../components/ui/Spinner'
import { formatDateTime, formatMoney } from '../../lib/format'
import { StatusBadge } from '../reservations/StatusBadge'
import { CHANNEL_LABEL, UNIT_STATUS_LABEL, useAdminQuery, type Dashboard } from './admin-api'
import { SectionHeader, StatCard, TD, Table } from './components'

export function DashboardPage() {
  const { data, isLoading, error } = useAdminQuery<Dashboard>('dashboard', { refetchInterval: 30_000 })
  if (isLoading) return <LoadingBlock />
  if (error || !data) return <ErrorAlert error={error} />

  const revenue = data.revenueThisMonth.map((r) => formatMoney(r.amount, r.currency)).join(' · ') || formatMoney(0, 'USD')
  const totalUnits = data.fleet.reduce((sum, f) => sum + f.units, 0)
  const webhookProblems = data.webhooks.failed + data.webhooks.dead

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="Resumen de operación" subtitle="Se actualiza cada 30 segundos. Horas en hora de Ecuador." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Entregas hoy" value={data.pickups_today} icon={<ArrowUpFromLine className="h-5 w-5" />} />
        <StatCard label="Devoluciones hoy" value={data.returns_today} icon={<ArrowDownToLine className="h-5 w-5" />} />
        <StatCard label="Alquileres en curso" value={data.active_rentals} icon={<CarFront className="h-5 w-5" />} />
        <StatCard label="Ingresos del mes" value={revenue} icon={<DollarSign className="h-5 w-5" />} tone="text-emerald-600" />
        <StatCard label="Próximas reservas" value={data.upcoming} icon={<CalendarClock className="h-5 w-5" />} />
        <StatCard
          label="Devoluciones atrasadas"
          value={data.overdue_returns}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone={data.overdue_returns ? 'text-rose-600' : 'text-slate-400'}
        />
        <StatCard label="Reservas web (30 días)" value={data.web_last_30d} icon={<Globe className="h-5 w-5" />} />
        <StatCard label="Reservas Booking Hub (30 días)" value={data.hub_last_30d} icon={<Network className="h-5 w-5" />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold text-slate-900">Flota ({totalUnits} unidades)</h2>
          <ul className="flex flex-col gap-2">
            {data.fleet.map((f) => (
              <li key={f.status}>
                <div className="mb-1 flex justify-between text-sm text-slate-600">
                  <span>{UNIT_STATUS_LABEL[f.status] ?? f.status}</span>
                  <span className="font-semibold">{f.units}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-brand-500" style={{ width: `${(f.units / Math.max(totalUnits, 1)) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold text-slate-900">Integración con el Booking Hub</h2>
          <dl className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">Eventos por publicar</dt><dd className="text-xl font-bold">{data.webhooks.pending_events}</dd></div>
            <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">Webhooks reintentando</dt><dd className="text-xl font-bold">{data.webhooks.failed}</dd></div>
            <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">Webhooks agotados</dt><dd className="text-xl font-bold">{data.webhooks.dead}</dd></div>
          </dl>
          <p className="mt-3 text-sm text-slate-500">
            {webhookProblems ? 'Hay entregas con problemas. ' : 'Todas las notificaciones se entregaron. '}
            <Link to="/admin/integracion" className="font-medium text-brand-600 hover:underline">Ver monitor</Link>
          </p>
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Últimas reservas</h2>
          <Link to="/admin/reservas" className="text-sm font-medium text-brand-600 hover:underline">Ver todas</Link>
        </div>
        <Table head={['Localizador', 'Vehículo', 'Conductor', 'Recogida', 'Canal', 'Estado', 'Total']} empty={!data.recentReservations.length}>
          {data.recentReservations.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50">
              <td className={TD}><Link to={`/admin/reservas/${r.id}`} className="font-mono font-semibold text-brand-700 hover:underline">{r.locator}</Link></td>
              <td className={TD}>{r.vehicle}</td>
              <td className={TD}>{r.driver}</td>
              <td className={TD}>{formatDateTime(r.pickupAt)}</td>
              <td className={TD}>{CHANNEL_LABEL[r.channel]}</td>
              <td className={TD}><StatusBadge status={r.status} rentalStatus={r.rentalStatus} /></td>
              <td className={`${TD} text-right font-medium`}>{formatMoney(r.totalPrice, r.currency)}</td>
            </tr>
          ))}
        </Table>
      </div>
    </div>
  )
}
