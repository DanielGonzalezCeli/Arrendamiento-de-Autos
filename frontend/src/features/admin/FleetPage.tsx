import { CalendarOff, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { ErrorAlert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Field, INPUT_CLASS } from '../../components/ui/Field'
import { LoadingBlock } from '../../components/ui/Spinner'
import { formatDateTime } from '../../lib/format'
import { UNIT_STATUS_LABEL, useAdminMutation, useAdminQuery, type Depot, type FleetUnit, type VehicleBlock, type VehicleModel } from './admin-api'
import { ActiveBadge, EntityForm, Modal, Pill, SectionHeader, TD, Table, rules, type FieldSpec } from './components'

const PLATE = /^[A-Za-z]{3}-\d{3,4}$/
const STATUS_TONE: Record<string, 'green' | 'amber' | 'red'> = { AVAILABLE: 'green', MAINTENANCE: 'amber', OUT_OF_SERVICE: 'red' }
const EMPTY = { vehicleModelId: '', depotId: '', plate: '', year: new Date().getFullYear(), color: '', mileage: 0, status: 'AVAILABLE' }

export function FleetPage() {
  const [modelFilter, setModelFilter] = useState('')
  const [depotFilter, setDepotFilter] = useState('')
  const params = new URLSearchParams()
  if (modelFilter) params.set('vehicleModelId', modelFilter)
  if (depotFilter) params.set('depotId', depotFilter)
  const query = params.toString()

  const units = useAdminQuery<FleetUnit[]>(`fleet${query ? `?${query}` : ''}`)
  const models = useAdminQuery<VehicleModel[]>('models')
  const depots = useAdminQuery<Depot[]>('depots')
  const [editing, setEditing] = useState<FleetUnit | 'new' | null>(null)
  const [blocksOf, setBlocksOf] = useState<FleetUnit | null>(null)
  const create = useAdminMutation('POST', 'fleet')
  const update = useAdminMutation<Record<string, unknown>>('PATCH', (b) => `fleet/${b.id}`)

  const fields: FieldSpec[] = [
    { name: 'plate', label: 'Placa', required: true, placeholder: 'PBA-1234', validate: rules.pattern(PLATE, 'Formato ABC-1234') },
    { name: 'vehicleModelId', label: 'Modelo', type: 'select', required: true, options: models.data?.map((m) => ({ value: m.id, label: `${m.make} ${m.model}` })) },
    { name: 'depotId', label: 'Agencia actual', type: 'select', numeric: true, required: true, options: depots.data?.map((d) => ({ value: d.id, label: d.name })) },
    { name: 'status', label: 'Estado', type: 'select', required: true, options: ['AVAILABLE', 'MAINTENANCE', 'OUT_OF_SERVICE'].map((s) => ({ value: s, label: UNIT_STATUS_LABEL[s] })) },
    { name: 'year', label: 'Año', type: 'number', required: true, validate: rules.integer(1990, new Date().getFullYear() + 1) },
    { name: 'mileage', label: 'Kilometraje', type: 'number', required: true, validate: rules.integer(0, 2_000_000) },
    { name: 'color', label: 'Color', validate: rules.pattern(/^[\p{L} ]{3,30}$/u, 'Solo letras (3–30)') },
  ]

  async function save(values: Record<string, unknown>) {
    const body = { ...values, plate: String(values.plate).toUpperCase() }
    if (editing === 'new') await create.mutateAsync(body)
    else if (editing) await update.mutateAsync({ ...body, id: editing.id })
    setEditing(null)
  }

  const initial = editing && editing !== 'new'
    ? { ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, (editing as unknown as Record<string, unknown>)[k] ?? ''])), active: editing.active }
    : EMPTY

  return (
    <div>
      <SectionHeader
        title="Flota"
        subtitle="Unidades físicas (placas). La disponibilidad de cada modelo se calcula con estas unidades, sus reservas y sus bloqueos."
        action={<Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> Nueva unidad</Button>}
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <select aria-label="Filtrar por modelo" className={INPUT_CLASS} value={modelFilter} onChange={(e) => setModelFilter(e.target.value)}>
          <option value="">Todos los modelos</option>
          {models.data?.map((m) => <option key={m.id} value={m.id}>{m.make} {m.model}</option>)}
        </select>
        <select aria-label="Filtrar por agencia" className={INPUT_CLASS} value={depotFilter} onChange={(e) => setDepotFilter(e.target.value)}>
          <option value="">Todas las agencias</option>
          {depots.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      {units.isLoading ? <LoadingBlock /> : units.error ? <ErrorAlert error={units.error} /> : (
        <Table head={['Placa', 'Modelo', 'Agencia', 'Año', 'Kilometraje', 'Estado', '']} empty={!units.data?.length}>
          {units.data?.map((u) => (
            <tr key={u.id} className={u.active ? '' : 'opacity-60'}>
              <td className={`${TD} whitespace-nowrap font-mono font-semibold`}>{u.plate}</td>
              <td className={TD}>{u.vehicleModel.make} {u.vehicleModel.model}{u.color && <span className="block text-xs text-slate-500">{u.color}</span>}</td>
              <td className={TD}>{u.depot.name}</td>
              <td className={TD}>{u.year}</td>
              <td className={TD}>{u.mileage.toLocaleString('es-EC')} km</td>
              <td className={TD}>
                <div className="flex flex-col items-start gap-1">
                  <Pill tone={STATUS_TONE[u.status]}>{UNIT_STATUS_LABEL[u.status]}</Pill>
                  {!u.active && <ActiveBadge active={false} off="Dada de baja" />}
                </div>
              </td>
              <td className={`${TD} whitespace-nowrap text-right`}>
                <button type="button" aria-label={`Bloqueos de ${u.plate}`} title="Bloqueos de mantenimiento" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => setBlocksOf(u)}>
                  <CalendarOff className="h-4 w-4" />
                </button>
                <button type="button" aria-label={`Editar ${u.plate}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => setEditing(u)}>
                  <Pencil className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
        </Table>
      )}

      {editing && (
        <Modal title={editing === 'new' ? 'Nueva unidad' : `Editar ${editing.plate}`} onClose={() => setEditing(null)}>
          <EntityForm fields={fields} initial={initial} onSubmit={save} onCancel={() => setEditing(null)}>
            {editing !== 'new' ? (values, set) => (
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" className="h-4 w-4" checked={values.active !== false} onChange={(e) => set('active', e.target.checked)} />
                Unidad activa (darla de baja exige que las reservas futuras sigan cubiertas)
              </label>
            ) : undefined}
          </EntityForm>
        </Modal>
      )}
      {blocksOf && <BlocksDialog unit={blocksOf} onClose={() => setBlocksOf(null)} />}
    </div>
  )
}

/** "2026-11-01T08:00" (input datetime-local, hora de Ecuador) → RFC 3339 con zona -05:00. */
const toRfc3339 = (local: string) => `${local}:00-05:00`

function BlocksDialog({ unit, onClose }: { unit: FleetUnit; onClose: () => void }) {
  const blocks = useAdminQuery<VehicleBlock[]>(`fleet/${unit.id}/blocks`)
  const create = useAdminMutation<{ startsAt: string; endsAt: string; reason: string }>('POST', `fleet/${unit.id}/blocks`)
  const remove = useAdminMutation<{ id: string }>('DELETE', (b) => `blocks/${b.id}`)
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [reason, setReason] = useState('')
  const [invalid, setInvalid] = useState<Record<string, string>>({})

  function submit() {
    const found: Record<string, string> = {}
    if (!startsAt) found.startsAt = 'Obligatorio'
    if (!endsAt) found.endsAt = 'Obligatorio'
    else if (startsAt && endsAt <= startsAt) found.endsAt = 'Debe ser posterior al inicio'
    if (reason.trim().length < 3) found.reason = 'Describe el motivo (mínimo 3 caracteres)'
    setInvalid(found)
    if (Object.keys(found).length) return
    create.mutate(
      { startsAt: toRfc3339(startsAt), endsAt: toRfc3339(endsAt), reason: reason.trim() },
      { onSuccess: () => { setStartsAt(''); setEndsAt(''); setReason('') } },
    )
  }

  return (
    <Modal title={`Bloqueos de ${unit.plate}`} onClose={onClose} wide>
      <p className="mb-3 text-sm text-slate-500">Durante un bloqueo la unidad no cuenta para la disponibilidad (mantenimiento, revisión, reparación).</p>
      {blocks.isLoading ? <LoadingBlock /> : (
        <ul className="mb-4 flex flex-col divide-y divide-slate-100 rounded-xl border border-slate-200">
          {!blocks.data?.length && <li className="px-4 py-6 text-center text-sm text-slate-400">Sin bloqueos</li>}
          {blocks.data?.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <p className="font-medium text-slate-800">{b.reason}</p>
                <p className="text-slate-500">{formatDateTime(b.startsAt)} → {formatDateTime(b.endsAt)}</p>
              </div>
              <button type="button" aria-label="Eliminar bloqueo" className="rounded-lg p-2 text-rose-600 hover:bg-rose-50" disabled={remove.isPending} onClick={() => remove.mutate({ id: b.id })}>
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Desde *" htmlFor="block-start" error={invalid.startsAt}>
          <input id="block-start" type="datetime-local" className={INPUT_CLASS} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </Field>
        <Field label="Hasta *" htmlFor="block-end" error={invalid.endsAt}>
          <input id="block-end" type="datetime-local" className={INPUT_CLASS} value={endsAt} min={startsAt || undefined} onChange={(e) => setEndsAt(e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Motivo *" htmlFor="block-reason" error={invalid.reason}>
            <input id="block-reason" className={INPUT_CLASS} maxLength={200} placeholder="Mantenimiento de 10.000 km" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </div>
      </div>
      {(create.error || remove.error) && <div className="mt-3"><ErrorAlert error={create.error ?? remove.error} /></div>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cerrar</Button>
        <Button loading={create.isPending} onClick={submit}><Plus className="h-4 w-4" /> Agregar bloqueo</Button>
      </div>
    </Modal>
  )
}
