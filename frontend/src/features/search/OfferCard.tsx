import { depotLabel } from '../../lib/depots'
import { ArrowRight, Briefcase, DoorOpen, Fuel, MapPin, Settings2, Snowflake, Users } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CarIllustration } from '../../components/CarIllustration'
import { Card } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Spinner'
import { FUEL_LABEL, formatMoney, TRANSMISSION_LABEL, pluralize } from '../../lib/format'
import type { Offer } from '../../lib/types'

/** Tarjeta de una oferta en resultados: vehículo "o similar", proveedor, agencia y precio total. */
export function OfferCard({ offer, searchToken, index = 0 }: { offer: Offer; searchToken: string; index?: number }) {
  const { vehicle, price } = offer
  const perDay = price.total / price.rental_days
  const detailUrl = `/vehiculo/${vehicle.id}?token=${searchToken}`

  return (
    <div className="stagger" style={{ '--i': index } as CSSProperties}>
    <Card className="group overflow-hidden transition duration-300 hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-xl hover:shadow-asphalt-900/5">
      <div className="flex flex-col md:flex-row">
        <Link to={detailUrl} viewTransition className="relative block h-48 overflow-hidden bg-stone-100 md:h-auto md:w-72 md:shrink-0" tabIndex={-1} aria-hidden="true">
          <CarIllustration category={vehicle.category.code} imageUrl={vehicle.imageUrl} alt="" className="transition duration-500 group-hover:scale-105" />
          <span className="absolute top-3 left-3 rounded-full bg-asphalt-900/80 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
            {vehicle.category.name}
          </span>
          {offer.availableUnits <= 2 && (
            <span className="absolute bottom-3 left-3 rounded-full bg-accent-500 px-2.5 py-1 text-xs font-bold text-asphalt-900">
              {offer.availableUnits === 1 ? '¡Queda 1!' : `¡Quedan ${offer.availableUnits}!`}
            </span>
          )}
        </Link>

        <div className="flex flex-1 flex-col gap-4 p-5 md:flex-row md:items-stretch">
          <div className="flex-1">
            <p className="text-xs font-semibold tracking-wide text-brand-700 uppercase">{vehicle.supplier.name}</p>
            <h3 className="mt-1 text-xl font-bold text-asphalt-900">
              <Link to={detailUrl} viewTransition className="hover:text-brand-700">{vehicle.displayName}</Link>
            </h3>
            <ul className="mt-3 flex flex-wrap gap-1.5 text-xs text-slate-600">
              <Spec icon={<Users className="h-3.5 w-3.5" />}>{vehicle.seats} asientos</Spec>
              <Spec icon={<Briefcase className="h-3.5 w-3.5" />}>{pluralize(vehicle.bagCapacity, 'maleta', 'maletas')}</Spec>
              <Spec icon={<DoorOpen className="h-3.5 w-3.5" />}>{vehicle.doors} puertas</Spec>
              <Spec icon={<Settings2 className="h-3.5 w-3.5" />}>{TRANSMISSION_LABEL[vehicle.transmission]}</Spec>
              <Spec icon={<Fuel className="h-3.5 w-3.5" />}>{FUEL_LABEL[vehicle.fuelType] ?? vehicle.fuelType}</Spec>
              {vehicle.airConditioning && <Spec icon={<Snowflake className="h-3.5 w-3.5" />}>A/C</Spec>}
            </ul>
            <div className="mt-4 flex flex-col gap-1 text-xs text-slate-500">
              <p className="flex items-start gap-1.5">
                <MapPin className="mt-px h-3.5 w-3.5 shrink-0 text-brand-600" />
                <span>Retiras en <strong className="font-medium text-slate-700">{depotLabel(offer.pickupDepot)}</strong></span>
              </p>
              {offer.oneWay && (
                <p className="flex items-start gap-1.5 text-accent-600">
                  <MapPin className="mt-px h-3.5 w-3.5 shrink-0" />
                  <span>Devuelves en <strong className="font-medium">{depotLabel(offer.dropoffDepot)}</strong></span>
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col justify-between gap-3 border-t border-dashed border-stone-200 pt-4 md:w-48 md:border-t-0 md:border-l md:pt-0 md:pl-5 md:text-right">
            <div>
              <p className="text-xs text-slate-500"><span className="font-semibold text-slate-700">{formatMoney(perDay, price.currency)}</span> / día</p>
              <p className="font-display text-3xl font-extrabold text-asphalt-900">{formatMoney(price.total, price.currency)}</p>
              <p className="text-xs text-slate-400">Total {pluralize(price.rental_days, 'día', 'días')} · IVA incluido</p>
            </div>
            <Link to={detailUrl} viewTransition
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent-500 px-4 py-2.5 text-sm font-semibold text-asphalt-900 transition hover:bg-accent-400 active:scale-[0.97]">
              Ver y reservar <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </div>
    </Card>
    </div>
  )
}

function Spec({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-1.5 rounded-full bg-stone-100 px-2.5 py-1">
      <span className="text-slate-400">{icon}</span>
      {children}
    </li>
  )
}

/** Silueta de una tarjeta mientras llegan los resultados. */
export function OfferCardSkeleton() {
  return (
    <Card className="flex flex-col overflow-hidden md:flex-row">
      <Skeleton className="h-48 rounded-none md:h-44 md:w-72" />
      <div className="flex flex-1 flex-col gap-3 p-5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-6 w-56" />
        <div className="flex gap-2"><Skeleton className="h-6 w-20" /><Skeleton className="h-6 w-20" /><Skeleton className="h-6 w-24" /></div>
        <Skeleton className="h-3 w-64" />
      </div>
      <div className="flex flex-col gap-2 p-5 md:w-48">
        <Skeleton className="h-8 w-32 self-end" />
        <Skeleton className="h-10 w-full" />
      </div>
    </Card>
  )
}
