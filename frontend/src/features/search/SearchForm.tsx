import { depotLabel } from '../../lib/depots'
import { Search } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Field, Input, Select } from '../../components/ui/Field'
import { ecuadorDate, timeOptions } from '../../lib/datetime'
import type { LocationCity } from '../../lib/types'
import { useLocations } from '../catalog/queries'
import { criteriaToParams, defaultCriteria, SUPPORTED_CURRENCIES, validateCriteria, type SearchCriteria } from './search-criteria'

const TIMES = timeOptions()

/** Buscador del marketplace. Al enviar navega a /buscar?… (la búsqueda la hace ResultsPage). */
export function SearchForm({ initial, compact = false }: { initial?: SearchCriteria; compact?: boolean }) {
  const navigate = useNavigate()
  const locations = useLocations()
  const [criteria, setCriteria] = useState<SearchCriteria>(initial ?? defaultCriteria())
  const [differentDropoff, setDifferentDropoff] = useState(!!initial?.dropoff)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof SearchCriteria>(key: K, value: SearchCriteria[K]) => setCriteria((c) => ({ ...c, [key]: value }))

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const next = { ...criteria, dropoff: differentDropoff ? criteria.dropoff : '' }
    const problem = validateCriteria(next)
    setError(problem)
    if (!problem) navigate(`/buscar?${criteriaToParams(next)}`)
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {error && <Alert tone="error">{error}</Alert>}
      <div className={`grid gap-4 ${compact ? 'grid-cols-1' : 'md:grid-cols-2 lg:grid-cols-4'}`}>
        <div className={compact ? '' : 'md:col-span-2'}>
          <Field label="Lugar de recogida" htmlFor="pickup">
            <LocationSelect id="pickup" value={criteria.pickup} onChange={(v) => set('pickup', v)} cities={locations.data} loading={locations.isLoading} />
          </Field>
          <label className="mt-2 flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={differentDropoff} onChange={(e) => setDifferentDropoff(e.target.checked)} />
            Devolver en otra ubicación
          </label>
        </div>
        {differentDropoff && (
          <div className={compact ? '' : 'md:col-span-2'}>
            <Field label="Lugar de devolución" htmlFor="dropoff" hint="Solo agencias del mismo proveedor; tiene un recargo.">
              <LocationSelect id="dropoff" value={criteria.dropoff} onChange={(v) => set('dropoff', v)} cities={locations.data} loading={locations.isLoading} />
            </Field>
          </div>
        )}
        <DateTimeField label="Recogida" id="from" date={criteria.fromDate} time={criteria.fromTime}
          onDate={(v) => set('fromDate', v)} onTime={(v) => set('fromTime', v)} />
        <DateTimeField label="Devolución" id="to" date={criteria.toDate} time={criteria.toTime}
          onDate={(v) => set('toDate', v)} onTime={(v) => set('toTime', v)} />
        <Field label="Edad del conductor" htmlFor="age" hint="Menores de 25 tienen recargo.">
          <Input id="age" type="number" inputMode="numeric" min={18} max={99} step={1} value={criteria.age}
            onChange={(e) => set('age', Number(e.target.value.replace(/\D/g, '').slice(0, 2)))} />
        </Field>
        <Field label="Moneda" htmlFor="currency">
          <Select id="currency" value={criteria.currency} onChange={(e) => set('currency', e.target.value)}>
            {SUPPORTED_CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
        <div className={compact ? '' : 'flex items-start pt-6 md:col-span-2 lg:col-span-1 lg:col-start-4'}>
          <Button type="submit" className="w-full">
            <Search className="h-4 w-4" /> Buscar vehículos
          </Button>
        </div>
      </div>
    </form>
  )
}

function LocationSelect({ id, value, onChange, cities, loading }: {
  id: string; value: string; onChange: (value: string) => void; cities?: LocationCity[]; loading: boolean
}) {
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={loading}>
      <option value="">{loading ? 'Cargando ubicaciones…' : 'Ciudad o agencia'}</option>
      {cities?.map((city) => (
        <optgroup key={city.id} label={city.name}>
          <option value={`city:${city.id}`}>{city.name} — todas las agencias</option>
          {/* La búsqueda por aeropuerto (contrato) sigue siendo válida en enlaces y accesos de la portada,
              pero solo se lista si ya viene elegida: cada mostrador aparece como agencia. */}
          {city.airports.filter((code) => value === `airport:${code}`).map((code) => (
            <option key={code} value={`airport:${code}`}>Aeropuerto {code} — todos los mostradores</option>
          ))}
          {city.depots.map((d) => <option key={d.id} value={`depot:${d.id}`}>{depotLabel(d)}</option>)}
        </optgroup>
      ))}
    </Select>
  )
}

function DateTimeField({ label, id, date, time, onDate, onTime }: {
  label: string; id: string; date: string; time: string; onDate: (v: string) => void; onTime: (v: string) => void
}) {
  return (
    <Field label={label} htmlFor={`${id}-date`}>
      <div className="flex gap-2">
        <Input id={`${id}-date`} type="date" min={ecuadorDate(0)} value={date} onChange={(e) => onDate(e.target.value)} />
        <select className="shrink-0 rounded-xl border border-slate-300 bg-white px-2 text-sm" aria-label={`Hora de ${label.toLowerCase()}`} value={time} onChange={(e) => onTime(e.target.value)}>
          {TIMES.map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>
    </Field>
  )
}
