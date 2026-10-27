import { ArrowLeft, ArrowRight, Briefcase, DoorOpen, Fuel, Gauge, Settings2, ShieldCheck, Snowflake, Users } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { CarIllustration } from '../../components/CarIllustration'
import { DepotCard } from '../../components/DepotCard'
import { Alert, ErrorAlert } from '../../components/ui/Alert'
import { ButtonLink } from '../../components/ui/Button'
import { Card, PageContainer } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Spinner'
import { FUEL_LABEL, FUEL_POLICY_LABEL, TRANSMISSION_LABEL } from '../../lib/format'
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

  if (vehicle.isLoading) return <DetailSkeleton />
  if (vehicle.isError) return <PageContainer><ErrorAlert error={vehicle.error} /></PageContainer>
  const v = vehicle.data!

  return (
    <PageContainer>
      <Link to={backToResults} viewTransition className="group mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800">
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" /> Volver a los resultados
      </Link>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-6">
          <Card className="overflow-hidden">
            <div className="relative h-72 bg-stone-100 md:h-96">
              <CarIllustration category={v.category.code} imageUrl={v.imageUrl} alt={v.displayName} />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-asphalt-900/90 via-asphalt-900/50 to-transparent px-6 pt-20 pb-5 text-white">
                <span className="rounded-full bg-accent-500 px-2.5 py-0.5 text-xs font-bold text-asphalt-900">{v.category.name}</span>
                <h1 className="mt-2 text-3xl font-extrabold md:text-4xl">{v.displayName}</h1>
                <p className="text-stone-300">{v.supplier.name}{v.acrissCode && ` · ACRISS ${v.acrissCode}`}</p>
              </div>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-600">
                Reservas un modelo de la categoría; en la agencia se te asigna una unidad de este modelo o uno similar.
              </p>
              <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
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
            <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-asphalt-900"><ShieldCheck className="h-5 w-5 text-brand-600" /> Condiciones</h2>
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
            <Card className="animate-rise overflow-hidden lg:sticky lg:top-24">
              <div className="topo bg-asphalt-900 px-6 py-4 text-white">
                <p className="text-xs font-semibold tracking-[0.14em] text-accent-300 uppercase">Tu alquiler</p>
                <p className="font-display text-lg font-bold">{v.displayName}</p>
              </div>
              <div className="p-6">
              <div className="flex flex-col gap-4">
                <DepotCard title="Recogida" depot={offer.pickupDepot} when={last!.result.pickupAt} />
                <DepotCard title="Devolución" depot={offer.dropoffDepot} when={last!.result.dropoffAt} />
              </div>
              <div className="my-4 border-t border-dashed border-stone-200" />
              <PriceSummary price={offer.price} />
              <ButtonLink to={`/reservar/${v.id}?token=${token}`} variant="accent" className="group mt-5 w-full py-3 text-base">
                Reservar este vehículo <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </ButtonLink>
              <p className="mt-2 text-center text-xs text-slate-400">Podrás agregar extras en el siguiente paso.</p>
              </div>
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
    <div className="flex items-start gap-2.5 rounded-xl bg-stone-100/70 p-3">
      <span className="mt-0.5 text-brand-600 [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
      <div>
        <dt className="text-xs text-slate-500">{label}</dt>
        <dd className="text-sm font-medium text-slate-800">{value}</dd>
      </div>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <PageContainer>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]" role="status" aria-label="Cargando el vehículo">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-72 md:h-96" />
          <Skeleton className="h-6 w-2/3" />
          <div className="grid grid-cols-3 gap-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-16" />)}</div>
        </div>
        <Skeleton className="h-96" />
      </div>
    </PageContainer>
  )
}
