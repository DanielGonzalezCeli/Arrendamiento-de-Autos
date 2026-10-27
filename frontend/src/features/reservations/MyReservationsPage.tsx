import { CalendarDays, ChevronRight, ClipboardList } from 'lucide-react'
import { Link } from 'react-router-dom'
import { CarIllustration } from '../../components/CarIllustration'
import { ErrorAlert } from '../../components/ui/Alert'
import { ButtonLink } from '../../components/ui/Button'
import { Card, EmptyState, PageContainer } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Spinner'
import { formatDateTime, formatMoney } from '../../lib/format'
import { useMyReservations } from './reservations-api'
import { StatusBadge } from './StatusBadge'

export function MyReservationsPage() {
  const reservations = useMyReservations()

  return (
    <PageContainer eyebrow="Tu cuenta" title="Mis reservas" subtitle="Consulta, modifica o cancela tus alquileres.">
      {reservations.isLoading && (
        <div className="flex flex-col gap-3" role="status" aria-label="Cargando tus reservas">
          {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      )}
      {reservations.isError && <ErrorAlert error={reservations.error} />}
      {reservations.data?.length === 0 && (
        <EmptyState icon={<ClipboardList className="h-8 w-8" />} title="Aún no tienes reservas" action={<ButtonLink to="/" variant="accent">Buscar un vehículo</ButtonLink>}>
          Cuando reserves, aquí verás tu código, las fechas y el estado del alquiler.
        </EmptyState>
      )}
      <div className="flex flex-col gap-3">
        {reservations.data?.map((r, i) => (
          <Link key={r.id} to={`/mis-reservas/${r.id}`} viewTransition className="stagger group" style={{ '--i': i } as React.CSSProperties}>
            <Card className="flex items-center gap-4 overflow-hidden transition duration-300 group-hover:-translate-y-0.5 group-hover:border-brand-300 group-hover:shadow-lg">
              <div className="hidden h-28 w-40 shrink-0 overflow-hidden bg-stone-100 sm:block">
                <CarIllustration category={r.vehicle.category.code} imageUrl={r.vehicle.image_url} alt={r.vehicle.display_name} />
              </div>
              <div className="flex-1 py-4 pl-4 sm:pl-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-asphalt-900 px-2 py-0.5 font-mono text-sm font-bold tracking-wider text-accent-300">{r.locator}</span>
                  <StatusBadge status={r.status} rentalStatus={r.rentalStatus} />
                </div>
                <p className="mt-1.5 font-display text-lg font-bold text-asphalt-900">{r.vehicle.display_name}</p>
                <p className="flex items-center gap-1.5 text-sm text-slate-500">
                  <CalendarDays className="h-4 w-4" /> {formatDateTime(r.pickupAt)} → {formatDateTime(r.dropoffAt)}
                </p>
              </div>
              <div className="flex items-center gap-3 self-stretch border-l border-dashed border-stone-300 px-4 text-right">
                <p className="font-display text-lg font-bold text-asphalt-900">{formatMoney(r.totalPrice, r.currency)}</p>
                <ChevronRight className="h-5 w-5 text-slate-400 transition-transform group-hover:translate-x-0.5" />
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </PageContainer>
  )
}
