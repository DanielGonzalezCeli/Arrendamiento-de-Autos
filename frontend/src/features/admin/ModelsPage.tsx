import { Eye, EyeOff, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { ErrorAlert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { LoadingBlock } from '../../components/ui/Spinner'
import { FUEL_LABEL, FUEL_POLICY_LABEL, TRANSMISSION_LABEL } from '../../lib/format'
import { useAdminMutation, useAdminQuery, type Category, type Supplier, type VehicleModel } from './admin-api'
import { ActiveBadge, EntityForm, Modal, Pill, SectionHeader, TD, Table, rules, type FieldSpec } from './components'

const options = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }))

const EMPTY = {
  supplierId: '', categoryId: '', make: '', model: '', acrissCode: '', transmission: 'MANUAL', fuelType: 'GASOLINE',
  fuelPolicy: 'FULL_TO_FULL', seats: 5, doors: 4, bagCapacity: 2, airConditioning: true, imageUrl: '', description: '', published: false,
}

export function ModelsPage() {
  const models = useAdminQuery<VehicleModel[]>('models')
  const categories = useAdminQuery<Category[]>('categories')
  const suppliers = useAdminQuery<Supplier[]>('suppliers')
  const [editing, setEditing] = useState<VehicleModel | 'new' | null>(null)
  const create = useAdminMutation('POST', 'models')
  const update = useAdminMutation<Record<string, unknown>>('PATCH', (b) => `models/${b.id}`)

  if (models.isLoading) return <LoadingBlock />
  if (models.error) return <ErrorAlert error={models.error} />

  const fields: FieldSpec[] = [
    { name: 'make', label: 'Marca', required: true, validate: rules.length(2, 50) },
    { name: 'model', label: 'Modelo', required: true, validate: rules.length(1, 60) },
    { name: 'categoryId', label: 'Categoría', type: 'select', required: true, options: categories.data?.map((c) => ({ value: c.id, label: c.name })) },
    { name: 'supplierId', label: 'Proveedor', type: 'select', numeric: true, required: true, options: suppliers.data?.map((s) => ({ value: s.id, label: s.name })) },
    { name: 'acrissCode', label: 'Código ACRISS', placeholder: 'EDAR', validate: rules.pattern(/^[A-Za-z]{4}$/, '4 letras (ej. EDAR)') },
    { name: 'transmission', label: 'Transmisión', type: 'select', required: true, options: options(TRANSMISSION_LABEL) },
    { name: 'fuelType', label: 'Combustible', type: 'select', required: true, options: options(FUEL_LABEL) },
    { name: 'fuelPolicy', label: 'Política de combustible', type: 'select', required: true, options: options(FUEL_POLICY_LABEL) },
    { name: 'seats', label: 'Asientos', type: 'number', required: true, validate: rules.integer(1, 15) },
    { name: 'doors', label: 'Puertas', type: 'number', required: true, validate: rules.integer(2, 6) },
    { name: 'bagCapacity', label: 'Maletas', type: 'number', required: true, validate: rules.integer(0, 10) },
    { name: 'imageUrl', label: 'Foto', placeholder: '/cars/toyota-yaris.jpg o https://…', validate: rules.pattern(/^(https:\/\/\S+|\/[\w./-]+)$/, 'URL https o ruta /cars/archivo.jpg') },
    { name: 'description', label: 'Descripción', type: 'textarea', validate: rules.length(0, 500) },
    { name: 'airConditioning', label: 'Aire acondicionado', type: 'checkbox' },
    { name: 'published', label: 'Publicado en el marketplace y el Booking Hub', type: 'checkbox' },
  ]

  const initial = editing && editing !== 'new'
    ? { ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, (editing as unknown as Record<string, unknown>)[k] ?? ''])), active: editing.active }
    : EMPTY

  async function save(values: Record<string, unknown>) {
    if (editing === 'new') await create.mutateAsync(values)
    else if (editing) await update.mutateAsync({ ...values, id: editing.id })
    setEditing(null)
  }

  return (
    <div>
      <SectionHeader
        title="Modelos"
        subtitle="Cada modelo es la oferta comercial (vehicle_id del contrato). Solo los publicados y activos aparecen en búsquedas."
        action={<Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> Nuevo modelo</Button>}
      />
      <Table head={['', 'Modelo', 'Categoría', 'Proveedor', 'Especificaciones', 'Unidades', 'Estado', '']} empty={!models.data?.length}>
        {models.data?.map((m) => (
          <tr key={m.id} className={m.active ? '' : 'opacity-60'}>
            <td className={TD}>
              {m.imageUrl ? <img src={m.imageUrl} alt="" className="h-10 w-16 rounded-md object-cover" /> : <div className="h-10 w-16 rounded-md bg-slate-100" />}
            </td>
            <td className={TD}><p className="font-semibold">{m.make} {m.model}</p><p className="font-mono text-xs text-slate-500">{m.acrissCode}</p></td>
            <td className={TD}>{m.category.name}</td>
            <td className={TD}>{m.supplier.name}</td>
            <td className={`${TD} text-xs text-slate-500`}>{TRANSMISSION_LABEL[m.transmission]} · {FUEL_LABEL[m.fuelType]} · {m.seats} asientos · {m.bagCapacity} maletas</td>
            <td className={TD}>{m.units}</td>
            <td className={TD}>
              <div className="flex flex-col items-start gap-1">
                <Pill tone={m.published ? 'blue' : 'slate'}>{m.published ? 'Publicado' : 'Oculto'}</Pill>
                {!m.active && <ActiveBadge active={false} />}
              </div>
            </td>
            <td className={`${TD} whitespace-nowrap text-right`}>
              <button
                type="button"
                title={m.published ? 'Ocultar' : 'Publicar'}
                aria-label={`${m.published ? 'Ocultar' : 'Publicar'} ${m.make} ${m.model}`}
                disabled={!m.active || update.isPending}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
                onClick={() => update.mutate({ id: m.id, published: !m.published })}
              >
                {m.published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <button type="button" aria-label={`Editar ${m.make} ${m.model}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => setEditing(m)}>
                <Pencil className="h-4 w-4" />
              </button>
            </td>
          </tr>
        ))}
      </Table>
      {update.error && !editing && <div className="mt-3"><ErrorAlert error={update.error} /></div>}

      {editing && (
        <Modal title={editing === 'new' ? 'Nuevo modelo' : `Editar ${editing.make} ${editing.model}`} onClose={() => setEditing(null)} wide>
          <EntityForm fields={fields} initial={initial} onSubmit={save} onCancel={() => setEditing(null)}>
            {editing !== 'new' ? (values, set) => (
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" className="h-4 w-4" checked={values.active !== false} onChange={(e) => set('active', e.target.checked)} />
                Modelo activo (desactivarlo lo oculta y exige que no tenga reservas futuras)
              </label>
            ) : undefined}
          </EntityForm>
        </Modal>
      )}
    </div>
  )
}
