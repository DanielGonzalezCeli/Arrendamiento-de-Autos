import { Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { Alert, ErrorAlert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { INPUT_CLASS } from '../../components/ui/Field'
import { LoadingBlock } from '../../components/ui/Spinner'
import { ApiError } from '../../lib/api'
import { WEEKDAYS } from '../../lib/format'
import { useAdminMutation, useAdminQuery, type City, type Depot, type Supplier } from './admin-api'
import { ActiveBadge, EntityForm, Modal, SectionHeader, TD, Table, rules, type FieldSpec } from './components'

export const DEPOT_SERVICES: Record<string, string> = {
  AIRPORT_COUNTER: 'Mostrador en aeropuerto',
  SHUTTLE: 'Traslado a la agencia',
  AFTER_HOURS_RETURN: 'Devolución fuera de horario',
  CITY_OFFICE: 'Oficina en ciudad',
  DELIVERY: 'Entrega a domicilio',
}

type DayHours = { open: boolean; opens: string; closes: string }
const DEFAULT_WEEK: DayHours[] = Array.from({ length: 7 }, (_, d) => ({ open: d !== 0, opens: '08:00', closes: '18:00' }))

const EMPTY = { name: '', address: '', supplierId: '', cityId: '', airportCode: '', latitude: '', longitude: '', phone: '', active: true }

export function DepotsPage() {
  const depots = useAdminQuery<Depot[]>('depots')
  const cities = useAdminQuery<City[]>('cities')
  const suppliers = useAdminQuery<Supplier[]>('suppliers')
  const [editing, setEditing] = useState<Depot | 'new' | null>(null)
  const [saved, setSaved] = useState(false)
  const create = useAdminMutation('POST', 'depots')
  const update = useAdminMutation<Record<string, unknown>>('PATCH', (b) => `depots/${b.id}`)

  if (depots.isLoading) return <LoadingBlock />
  if (depots.error) return <ErrorAlert error={depots.error} />

  const fields: FieldSpec[] = [
    { name: 'name', label: 'Nombre', required: true, full: true, validate: rules.length(3, 120) },
    { name: 'address', label: 'Dirección', required: true, full: true, validate: rules.length(5, 200) },
    { name: 'supplierId', label: 'Proveedor', type: 'select', numeric: true, required: true, options: suppliers.data?.map((s) => ({ value: s.id, label: s.name })) },
    { name: 'cityId', label: 'Ciudad', type: 'select', numeric: true, required: true, options: cities.data?.map((c) => ({ value: c.id, label: c.name })) },
    { name: 'airportCode', label: 'Código IATA (si está en aeropuerto)', placeholder: 'UIO', validate: rules.pattern(/^[A-Za-z]{3}$/, '3 letras') },
    { name: 'phone', label: 'Teléfono', type: 'phone' },
    { name: 'latitude', label: 'Latitud', type: 'number', step: 'any', required: true, validate: rules.range(-90, 90) },
    { name: 'longitude', label: 'Longitud', type: 'number', step: 'any', required: true, validate: rules.range(-180, 180) },
    { name: 'active', label: 'Agencia activa (desactivarla exige que no tenga reservas en curso)', type: 'checkbox', full: true },
  ]

  function initialFor(d: Depot | 'new') {
    if (d === 'new') return { ...EMPTY, services: [] as string[], week: DEFAULT_WEEK }
    const week = DEFAULT_WEEK.map((_, weekday) => {
      const h = d.openingHours.find((o) => o.weekday === weekday)
      return h ? { open: true, opens: h.opens.slice(0, 5), closes: h.closes.slice(0, 5) } : { open: false, opens: '08:00', closes: '18:00' }
    })
    return { ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, (d as unknown as Record<string, unknown>)[k] ?? ''])), services: d.services, week }
  }

  async function save(values: Record<string, unknown>) {
    const { week, ...rest } = values as Record<string, unknown> & { week: DayHours[] }
    const bad = week.findIndex((h) => h.open && h.opens >= h.closes)
    if (bad >= 0) throw new ApiError(400, `${WEEKDAYS[bad]}: la apertura debe ser antes del cierre`)
    const body = {
      ...rest,
      airportCode: rest.airportCode ? String(rest.airportCode).toUpperCase() : null,
      openingHours: week.flatMap((h, weekday) => (h.open ? [{ weekday, opens: h.opens, closes: h.closes }] : [])),
    }
    if (editing === 'new') await create.mutateAsync(body)
    else if (editing) await update.mutateAsync({ ...body, id: editing.id })
    setEditing(null)
    setSaved(true)
  }

  return (
    <div>
      <SectionHeader
        title="Agencias"
        subtitle="Cada cambio publica el evento DEPOT_UPDATE para que el Booking Hub actualice su copia."
        action={<Button onClick={() => { setSaved(false); setEditing('new') }}><Plus className="h-4 w-4" /> Nueva agencia</Button>}
      />
      {saved && <div className="mb-4"><Alert tone="success">Agencia guardada. Se registró el evento DEPOT_UPDATE.</Alert></div>}
      <Table head={['Agencia', 'Ciudad', 'Horario', 'Servicios', 'Estado', '']} empty={!depots.data?.length}>
        {depots.data?.map((d) => (
          <tr key={d.id} className={d.active ? '' : 'opacity-60'}>
            <td className={TD}>
              <p className="font-semibold">{d.name}</p>
              <p className="text-xs text-slate-500">{d.address}{d.phone ? ` · ${d.phone}` : ''}</p>
            </td>
            <td className={TD}>{d.city.name}{d.airportCode && <span className="block font-mono text-xs text-slate-500">{d.airportCode}</span>}</td>
            <td className={`${TD} text-xs text-slate-500`}>{summarizeHours(d)}</td>
            <td className={`${TD} text-xs text-slate-500`}>{d.services.map((s) => DEPOT_SERVICES[s] ?? s).join(', ')}</td>
            <td className={TD}><ActiveBadge active={d.active} on="Activa" off="Inactiva" /></td>
            <td className={`${TD} text-right`}>
              <button type="button" aria-label={`Editar ${d.name}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => { setSaved(false); setEditing(d) }}>
                <Pencil className="h-4 w-4" />
              </button>
            </td>
          </tr>
        ))}
      </Table>

      {editing && (
        <Modal title={editing === 'new' ? 'Nueva agencia' : `Editar ${editing.name}`} onClose={() => setEditing(null)} wide>
          <EntityForm fields={fields} initial={initialFor(editing)} onSubmit={save} onCancel={() => setEditing(null)}>
            {(values, set) => {
              const services = values.services as string[]
              const week = values.week as DayHours[]
              const setDay = (i: number, patch: Partial<DayHours>) => set('week', week.map((h, d) => (d === i ? { ...h, ...patch } : h)))
              return (
                <div className="flex flex-col gap-4">
                  <fieldset>
                    <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Servicios</legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {Object.entries(DEPOT_SERVICES).map(([code, label]) => (
                        <label key={code} className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={services.includes(code)}
                            onChange={(e) => set('services', e.target.checked ? [...services, code] : services.filter((s) => s !== code))}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset>
                    <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Horario (hora de Ecuador)</legend>
                    <div className="flex flex-col gap-2">
                      {week.map((h, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-2">
                          <label className="flex w-24 items-center gap-2 text-sm font-medium text-slate-700">
                            <input type="checkbox" className="h-4 w-4" checked={h.open} onChange={(e) => setDay(i, { open: e.target.checked })} />
                            {WEEKDAYS[i]}
                          </label>
                          {h.open ? (
                            <>
                              <input aria-label={`${WEEKDAYS[i]} abre`} type="time" className={`${INPUT_CLASS} w-32`} value={h.opens} onChange={(e) => setDay(i, { opens: e.target.value })} />
                              <span className="text-slate-400">a</span>
                              <input
                                aria-label={`${WEEKDAYS[i]} cierra`}
                                type="time"
                                className={`${INPUT_CLASS} w-32`}
                                value={h.closes}
                                aria-invalid={h.opens >= h.closes ? true : undefined}
                                onChange={(e) => setDay(i, { closes: e.target.value })}
                              />
                            </>
                          ) : <span className="text-sm text-slate-400">Cerrado</span>}
                        </div>
                      ))}
                    </div>
                  </fieldset>
                </div>
              )
            }}
          </EntityForm>
        </Modal>
      )}
    </div>
  )
}

function summarizeHours(d: Depot) {
  if (!d.openingHours.length) return 'Sin horario'
  const sorted = [...d.openingHours].sort((a, b) => a.weekday - b.weekday)
  const same = sorted.every((h) => h.opens === sorted[0].opens && h.closes === sorted[0].closes)
  const range = (h: { opens: string; closes: string }) => `${h.opens.slice(0, 5)}–${h.closes.slice(0, 5)}`
  if (same) return `${sorted.length === 7 ? 'Todos los días' : sorted.map((h) => WEEKDAYS[h.weekday]).join(', ')} ${range(sorted[0])}`
  return sorted.map((h) => `${WEEKDAYS[h.weekday]} ${range(h)}`).join(' · ')
}
