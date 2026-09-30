import { CalendarDays, ChevronRight, ClipboardList } from 'lucide-react'
import { Link } from 'react-router-dom'
import { CarIllustration } from '../../components/CarIllustration'
import { ErrorAlert } from '../../components/ui/Alert'
import { ButtonLink } from '../../components/ui/Button'
import { Card, EmptyState, PageContainer } from '../../components/ui/Card'
import { LoadingBlock } from '../../components/ui/Spinner'
import { formatDateTime, formatMoney } from '../../lib/format'
import { useMyReservations } from './reservations-api'
import { StatusBadge } from './StatusBadge'

export function MyReservationsPage() {
  const reservations = useMyReservations()

  return (
    <PageContainer title="Mis reservas" subtitle="Consulta, modifica o cancela tus alquileres.">
      {reservations.isLoading && <LoadingBlock />}
      {reservations.isError && <ErrorAlert error={reservations.error} />}
      {reservations.data?.length === 0 && (
        <EmptyState icon={<ClipboardList className="h-10 w-10" />} title="Aún no tienes reservas">
          <ButtonLink to="/" className="mt-3">Buscar un vehículo</ButtonLink>
        </EmptyState>
      )}
      <div className="flex flex-col gap-3">
        {reservations.data?.map((r) => (
          <Link key={r.id} to={`/mis-reservas/${r.id}`} className="group">
            <Card className="flex items-center gap-4 overflow-hidden transition group-hover:border-brand-300 group-hover:shadow-md">
              <div className="hidden h-24 w-36 shrink-0 sm:block">
                <CarIllustration category={r.vehicle.category.code} alt={r.vehicle.display_name} />
              </div>
              <div className="flex-1 py-4 pl-4 sm:pl-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-bold text-slate-900">{r.locator}</span>
                  <StatusBadge status={r.status} rentalStatus={r.rentalStatus} />
                </div>
                <p className="mt-1 font-semibold text-slate-800">{r.vehicle.display_name}</p>
                <p className="flex items-center gap-1.5 text-sm text-slate-500">
                  <CalendarDays className="h-4 w-4" /> {formatDateTime(r.pickupAt)} → {formatDateTime(r.dropoffAt)}
                </p>
              </div>
              <div className="pr-4 text-right">
                <p className="font-bold text-slate-900">{formatMoney(r.totalPrice, r.currency)}</p>
                <ChevronRight className="ml-auto h-5 w-5 text-slate-400" />
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </PageContainer>
  )
}
