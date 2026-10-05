import { depotLabel } from '../../lib/depots'
import { Briefcase, DoorOpen, Fuel, MapPin, Settings2, Snowflake, Users } from 'lucide-react'
import { CarIllustration } from '../../components/CarIllustration'
import { ButtonLink } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { FUEL_LABEL, formatMoney, TRANSMISSION_LABEL, pluralize } from '../../lib/format'
import type { Offer } from '../../lib/types'

/** Tarjeta de una oferta en resultados: vehículo "o similar", proveedor, agencia y precio total. */
export function OfferCard({ offer, searchToken }: { offer: Offer; searchToken: string }) {
  const { vehicle, price } = offer
  const perDay = price.total / price.rental_days
  const detailUrl = `/vehiculo/${vehicle.id}?token=${searchToken}`

  return (
    <Card className="flex flex-col overflow-hidden md:flex-row">
      <div className="h-44 md:h-auto md:w-72 md:shrink-0">
        <CarIllustration category={vehicle.category.code} imageUrl={vehicle.imageUrl} alt={vehicle.displayName} />
      </div>
      <div className="flex flex-1 flex-col gap-4 p-5 md:flex-row md:items-center">
        <div className="flex-1">
          <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700">{vehicle.category.name}</span>
          <h3 className="mt-2 text-lg font-bold text-slate-900">{vehicle.displayName}</h3>
          <p className="text-sm text-slate-500">{vehicle.supplier.name}</p>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-slate-600">
            <Spec icon={<Users className="h-4 w-4" />}>{vehicle.seats} asientos</Spec>
            <Spec icon={<Briefcase className="h-4 w-4" />}>{pluralize(vehicle.bagCapacity, 'maleta', 'maletas')}</Spec>
            <Spec icon={<DoorOpen className="h-4 w-4" />}>{vehicle.doors} puertas</Spec>
            <Spec icon={<Settings2 className="h-4 w-4" />}>{TRANSMISSION_LABEL[vehicle.transmission]}</Spec>
            <Spec icon={<Fuel className="h-4 w-4" />}>{FUEL_LABEL[vehicle.fuelType] ?? vehicle.fuelType}</Spec>
            {vehicle.airConditioning && <Spec icon={<Snowflake className="h-4 w-4" />}>A/C</Spec>}
          </ul>
          <div className="mt-3 flex flex-col gap-0.5 text-xs text-slate-500">
            <p className="flex items-start gap-1.5">
              <MapPin className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>Retiras en <strong className="font-medium text-slate-700">{depotLabel(offer.pickupDepot)}</strong></span>
            </p>
            {offer.oneWay && (
              <p className="flex items-start gap-1.5 text-amber-700">
                <MapPin className="mt-px h-3.5 w-3.5 shrink-0" />
                <span>Devuelves en <strong className="font-medium">{depotLabel(offer.dropoffDepot)}</strong></span>
              </p>
            )}
          </div>
          {offer.availableUnits <= 2 && (
            <p className="mt-1 text-xs font-semibold text-rose-600">{offer.availableUnits === 1 ? '¡Solo queda 1!' : `¡Solo quedan ${offer.availableUnits}!`}</p>
          )}
        </div>
        <div className="flex flex-col items-start gap-2 border-t border-slate-100 pt-4 md:items-end md:border-t-0 md:border-l md:pt-0 md:pl-6">
          <p className="text-xs text-slate-500">{formatMoney(perDay, price.currency)} / día</p>
          <p className="text-2xl font-extrabold text-slate-900">{formatMoney(price.total, price.currency)}</p>
          <p className="text-xs text-slate-400">Total {pluralize(price.rental_days, 'día', 'días')}, IVA incluido</p>
          <ButtonLink to={detailUrl} className="mt-1 w-full md:w-auto">Ver y reservar</ButtonLink>
        </div>
      </div>
    </Card>
  )
}

function Spec({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className="text-slate-400">{icon}</span>
      {children}
    </li>
  )
}
