import { useQuery } from '@tanstack/react-query'
import { CalendarClock, Download, MapPin, Printer, ShieldCheck, Wrench } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { LogoMark } from '../../components/Logo'
import { ErrorAlert } from '../../components/ui/Alert'
import { Button, ButtonLink } from '../../components/ui/Button'
import { PageContainer } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Spinner'
import { API_BASE_URL, apiFetch } from '../../lib/api'
import { formatDateTime, formatMoney } from '../../lib/format'
import type { OrderStatus, RentalStatus } from '../../lib/types'
import { useAuth } from '../auth/AuthContext'
import { StatusBadge } from '../reservations/StatusBadge'

interface Voucher {
  id: string
  locator: string
  status: OrderStatus
  rentalStatus: RentalStatus
  issuedAt: string
  vehicle: { name: string; category: string | null; transmission: string | null; fuelType: string | null; seats: number | null; imageUrl: string | null; supplier: string | null; plate: string | null }
  pickup: { depot: string; address: string | null; at: string }
  dropoff: { depot: string; address: string | null; at: string }
  rentalDays: number
  oneWay: boolean
  driver: { fullName: string; age: number }
  extras: string[]
  total: number
  currency: string
  paymentCard: string | null
  url: string
  qrSvg: string
}

/**
 * Voucher público (link firmado o QR). No requiere sesión: lo abre el cliente en el celular y el agente
 * al escanearlo en el mostrador. Si quien lo abre es administrador, ofrece ir directo a la reserva.
 */
export function VoucherPage() {
  const { locator = '' } = useParams()
  const [params] = useSearchParams()
  const token = params.get('t') ?? ''
  const { user } = useAuth()
  const query = useQuery({
    queryKey: ['voucher', locator, token],
    queryFn: () => apiFetch<Voucher>(`/api/vouchers/${encodeURIComponent(locator)}?t=${encodeURIComponent(token)}`),
    retry: false,
  })
  const pdfUrl = `${API_BASE_URL}/api/vouchers/${encodeURIComponent(locator)}/pdf?t=${encodeURIComponent(token)}`

  if (query.isLoading) {
    return (
      <PageContainer>
        <div className="mx-auto flex max-w-3xl flex-col gap-4" role="status" aria-label="Cargando el voucher">
          <Skeleton className="h-28" /><Skeleton className="h-72" />
        </div>
      </PageContainer>
    )
  }
  if (query.isError || !query.data) {
    return <PageContainer><div className="mx-auto max-w-3xl"><ErrorAlert error={query.error} /></div></PageContainer>
  }
  const v = query.data
  const cancelled = v.status === 'CANCELLED'

  return (
    <PageContainer>
      <div className="mx-auto flex max-w-3xl flex-col gap-4 print:max-w-none">
        <div className="flex flex-wrap items-center justify-end gap-2 print:hidden">
          {user?.role === 'ADMIN' && (
            <ButtonLink to={`/admin/reservas/${v.id}`} variant="primary"><Wrench className="h-4 w-4" /> Gestionar en el panel</ButtonLink>
          )}
          <Button variant="secondary" onClick={() => window.print()}><Printer className="h-4 w-4" /> Imprimir</Button>
          <a href={pdfUrl} className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent-500 px-4 py-2.5 text-sm font-semibold text-asphalt-900 shadow-sm transition hover:bg-accent-400 active:scale-[0.97]">
            <Download className="h-4 w-4" /> Descargar PDF
          </a>
        </div>

        <article className="animate-pop overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-xl shadow-asphalt-900/5 print:shadow-none">
          {/* Cabecera tipo boleto */}
          <header className="topo relative flex flex-wrap items-center justify-between gap-4 bg-asphalt-900 px-6 py-5 text-white sm:px-8">
            <div className="flex items-center gap-3">
              <LogoMark className="h-10 w-10" />
              <div>
                <p className="font-display text-xl font-extrabold">Ruta<span className="text-accent-400">Libre</span></p>
                <p className="text-xs text-stone-300">Voucher de alquiler de vehículo</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-mono text-2xl font-bold tracking-wider text-accent-300">{v.locator}</p>
              <div className="mt-1 flex justify-end"><StatusBadge status={v.status} rentalStatus={v.rentalStatus} /></div>
            </div>
          </header>

          {cancelled && (
            <p className="bg-rose-50 px-6 py-3 text-center text-sm font-semibold text-rose-700 sm:px-8">Esta reserva fue cancelada: el voucher ya no es válido para retirar el vehículo.</p>
          )}

          <div className={`grid gap-6 p-6 sm:grid-cols-[1fr_auto] sm:p-8 ${cancelled ? 'opacity-60' : ''}`}>
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-bold text-asphalt-900">{v.vehicle.name}</h1>
              <p className="mt-1 text-sm text-slate-500">
                {[v.vehicle.category, v.vehicle.transmission, v.vehicle.fuelType, v.vehicle.seats && `${v.vehicle.seats} asientos`].filter(Boolean).join(' · ')}
              </p>
              {v.vehicle.supplier && <p className="text-sm text-slate-500">Proveedor: {v.vehicle.supplier}</p>}
              {v.vehicle.plate && <p className="mt-2 inline-block rounded-md bg-brand-50 px-2 py-0.5 text-sm font-semibold text-brand-700">Placa {v.vehicle.plate}</p>}

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <Endpoint label="Recogida" point={v.pickup} />
                <Endpoint label={v.oneWay ? 'Devolución (otra agencia)' : 'Devolución'} point={v.dropoff} />
              </div>
            </div>

            <div className="flex flex-col items-center gap-2 sm:w-48">
              <div className="w-44 rounded-2xl border border-stone-200 p-2 [&_svg]:h-auto [&_svg]:w-full" aria-label="Código QR del voucher" role="img"
                dangerouslySetInnerHTML={{ __html: v.qrSvg }} />
              <p className="text-center text-xs text-slate-500">Muéstralo en el mostrador</p>
            </div>
          </div>

          {/* Línea perforada */}
          <div className="relative mx-6 border-t-2 border-dashed border-stone-200 sm:mx-8" aria-hidden="true">
            <span className="absolute -top-3 -left-9 h-6 w-6 rounded-full bg-paper sm:-left-11" />
            <span className="absolute -top-3 -right-9 h-6 w-6 rounded-full bg-paper sm:-right-11" />
          </div>

          <dl className="grid gap-x-8 gap-y-3 p-6 text-sm sm:grid-cols-2 sm:p-8">
            <Row label="Conductor principal" value={`${v.driver.fullName} (${v.driver.age} años)`} />
            <Row label="Duración" value={`${v.rentalDays} ${v.rentalDays === 1 ? 'día' : 'días'}`} />
            <Row label="Extras" value={v.extras.length ? v.extras.join(', ') : 'Ninguno'} />
            <Row label="Total pagado (IVA incluido)" value={[formatMoney(v.total, v.currency), v.paymentCard].filter(Boolean).join(' · ')} />
          </dl>

          <footer className="bg-stone-50 px-6 py-5 text-sm text-slate-600 sm:px-8">
            <p className="mb-2 flex items-center gap-2 font-semibold text-asphalt-900"><ShieldCheck className="h-4 w-4 text-brand-600" /> Para retirar el vehículo</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Presenta este voucher, tu licencia de conducir vigente y tu cédula o pasaporte.</li>
              <li>Llega 15 minutos antes; el conductor debe ser la persona de la reserva.</li>
              <li>Devuélvelo con el mismo nivel de combustible y en buen estado: la inspección puede generar cargos.</li>
            </ul>
          </footer>
        </article>

        {user && user.role !== 'ADMIN' && (
          <p className="text-center text-sm text-slate-500 print:hidden">
            <Link to={`/mis-reservas/${v.id}`} className="font-semibold text-brand-700 hover:underline">Ver el detalle de la reserva</Link>
          </p>
        )}
      </div>
    </PageContainer>
  )
}

function Endpoint({ label, point }: { label: string; point: { depot: string; address: string | null; at: string } }) {
  return (
    <div className="rounded-2xl border border-stone-200 p-4">
      <p className="text-xs font-semibold tracking-wide text-accent-600 uppercase">{label}</p>
      <p className="mt-1 flex items-center gap-1.5 font-semibold text-asphalt-900"><CalendarClock className="h-4 w-4 text-slate-400" /> {formatDateTime(point.at)}</p>
      <p className="mt-1 flex items-start gap-1.5 text-sm text-slate-600"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /> <span>{point.depot}{point.address && <span className="block text-xs text-slate-500">{point.address}</span>}</span></p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-semibold text-asphalt-900">{value}</dd>
    </div>
  )
}
