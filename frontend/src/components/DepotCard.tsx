import { CalendarClock, ExternalLink, MapPin, Phone } from 'lucide-react'
import { depotLabel, mapsUrl } from '../lib/depots'
import { formatDateTime, WEEKDAYS } from '../lib/format'
import type { Depot } from '../lib/types'

type DepotData = Pick<Depot, 'name' | 'address'> & Partial<Pick<Depot, 'phone' | 'latitude' | 'longitude' | 'openingHours'>>

/**
 * Dónde y cuándo se recoge o devuelve el auto: agencia, dirección, teléfono, horario y mapa.
 * Lo usan el detalle del vehículo, el checkout y el detalle de la reserva.
 */
export function DepotCard({ title, depot, when }: { title: string; depot: DepotData; when?: string }) {
  const hours = [...(depot.openingHours ?? [])].sort((a, b) => a.weekday - b.weekday)
  const hasCoordinates = depot.latitude !== undefined && depot.longitude !== undefined

  return (
    <div className="flex flex-col gap-1 text-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      {when && <p className="flex items-center gap-1.5 font-medium text-slate-800"><CalendarClock className="h-4 w-4 text-slate-400" /> {formatDateTime(when)}</p>}
      <p className="flex items-start gap-1.5 text-slate-700">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <span><span className="font-medium">{depotLabel(depot)}</span><br /><span className="text-slate-500">{depot.address}</span></span>
      </p>
      {depot.phone && (
        <a href={`tel:${depot.phone}`} className="flex items-center gap-1.5 text-slate-600 hover:text-brand-700">
          <Phone className="h-4 w-4 text-slate-400" /> {depot.phone}
        </a>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-5.5 text-xs">
        {hasCoordinates && (
          <a href={mapsUrl({ latitude: depot.latitude!, longitude: depot.longitude! })} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-medium text-brand-600 hover:underline">
            Ver en Google Maps <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {hours.length > 0 && (
          <details className="text-slate-500">
            <summary className="cursor-pointer">Horario de atención</summary>
            <ul className="mt-1 grid grid-cols-2 gap-x-3">
              {hours.map((h) => <li key={h.weekday}>{WEEKDAYS[h.weekday]}: {h.opens}–{h.closes}</li>)}
            </ul>
          </details>
        )}
      </div>
    </div>
  )
}
