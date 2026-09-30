import { ArrowLeft, Briefcase, CalendarClock, DoorOpen, Fuel, Gauge, MapPin, Settings2, ShieldCheck, Snowflake, Users } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { CarIllustration } from '../../components/CarIllustration'
import { Alert, ErrorAlert } from '../../components/ui/Alert'
import { ButtonLink } from '../../components/ui/Button'
import { Card, PageContainer } from '../../components/ui/Card'
import { LoadingBlock } from '../../components/ui/Spinner'
import { formatDateTime, FUEL_LABEL, FUEL_POLICY_LABEL, TRANSMISSION_LABEL, WEEKDAYS } from '../../lib/format'
import type { Depot } from '../../lib/types'
import { PriceSummary } from '../checkout/PriceSummary'
import { readLastSearch, useVehicle } from '../catalog/queries'
import { criteriaToParams } from '../search/search-criteria'

/** Detalle: especificaciones, agencias, condiciones y precio de la oferta elegida en la búsqueda. */
export function VehicleDetailPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const token = params.get('token')
  const vehicle = useVehicle(id)
  const last = readLastSearch()
  const offer = last?.result.searchToken === token ? last?.result.offers.find((o) => o.vehicle.id === id) : undefined
  const backToResults = last ? `/buscar?${criteriaToParams(last.criteria)}` : '/'

  if (vehicle.isLoading) return <LoadingBlock />
  if (vehicle.isError) return <PageContainer><ErrorAlert error={vehicle.error} /></PageContainer>
  const v = vehicle.data!

  return (
    <PageContainer>
      <Link to={backToResults} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> Volver a los resultados
      </Link>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-6">
          <Card className="overflow-hidden">
            <div className="h-64">
              <CarIllustration category={v.category.code} imageUrl={v.imageUrl} alt={v.displayName} />
            </div>
            <div className="p-6">
              <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700">{v.category.name}</span>
              <h1 className="mt-2 text-2xl font-bold text-slate-900">{v.displayName}</h1>
              <p className="text-slate-500">{v.supplier.name}{v.acrissCode && ` · ACRISS ${v.acrissCode}`}</p>
              <p className="mt-3 text-sm text-slate-600">
                Reservas un modelo de la categoría; en la agencia se te asigna una unidad de este modelo o uno similar.
              </p>
              <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Spec icon={<Users />} label="Asientos" value={String(v.seats)} />
                <Spec icon={<DoorOpen />} label="Puertas" value={String(v.doors)} />
                <Spec icon={<Briefcase />} label="Maletas" value={String(v.bagCapacity)} />
                <Spec icon={<Settings2 />} label="Transmisión" value={TRANSMISSION_LABEL[v.transmission]} />
                <Spec icon={<Fuel />} label="Combustible" value={FUEL_LABEL[v.fuelType] ?? v.fuelType} />
                <Spec icon={<Gauge />} label="Política de combustible" value={FUEL_POLICY_LABEL[v.fuelPolicy] ?? v.fuelPolicy} />
                {v.airConditioning && <Spec icon={<Snowflake />} label="Climatización" value="Aire acondicionado" />}
              </dl>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-800"><ShieldCheck className="h-5 w-5 text-emerald-600" /> Condiciones</h2>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-600">
              <li>Edad mínima del conductor: <strong>{v.category.minDriverAge} años</strong>. Menores de 25 pagan un recargo diario.</li>
              <li><strong>Cancelación gratuita</strong> hasta 24 horas antes de la recogida; después se cobra un día de tarifa.</li>
              <li>Se requiere licencia de conducir vigente y tarjeta de crédito a nombre del conductor (depósito de garantía en la agencia).</li>
              <li>Cada 24 horas es un día de alquiler, con 59 minutos de tolerancia en la devolución.</li>
            </ul>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          {offer ? (
            <Card className="p-6 lg:sticky lg:top-6">
              <h2 className="mb-4 font-semibold text-slate-800">Tu alquiler</h2>
              <DepotInfo title="Recogida" depot={offer.pickupDepot} when={last!.result.pickupAt} />
              <DepotInfo title="Devolución" depot={offer.dropoffDepot} when={last!.result.dropoffAt} />
              <div className="my-4 border-t border-slate-100" />
              <PriceSummary price={offer.price} />
              <ButtonLink to={`/reservar/${v.id}?token=${token}`} className="mt-5 w-full">Reservar este vehículo</ButtonLink>
              <p className="mt-2 text-center text-xs text-slate-400">Podrás agregar extras en el siguiente paso.</p>
            </Card>
          ) : (
            <Alert tone="info">
              Para ver precio y disponibilidad, <Link to="/" className="font-semibold underline">realiza una búsqueda</Link> con tus fechas.
            </Alert>
          )}
        </div>
      </div>
    </PageContainer>
  )
}

function Spec({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-slate-400 [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
      <div>
        <dt className="text-xs text-slate-500">{label}</dt>
        <dd className="text-sm font-medium text-slate-800">{value}</dd>
      </div>
    </div>
  )
}

function DepotInfo({ title, depot, when }: { title: string; depot: Depot; when: string }) {
  const hours = [...depot.openingHours].sort((a, b) => a.weekday - b.weekday)
  return (
    <div className="mb-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <p className="flex items-center gap-1.5 text-sm font-medium text-slate-800"><CalendarClock className="h-4 w-4 text-slate-400" /> {formatDateTime(when)}</p>
      <p className="flex items-start gap-1.5 text-sm text-slate-600"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /> {depot.name}<br />{depot.address}</p>
      <details className="mt-1 text-xs text-slate-500">
        <summary className="cursor-pointer">Horario de la agencia</summary>
        <ul className="mt-1 grid grid-cols-2 gap-x-3">
          {hours.map((h) => <li key={h.weekday}>{WEEKDAYS[h.weekday]}: {h.opens}–{h.closes}</li>)}
        </ul>
      </details>
    </div>
  )
}
