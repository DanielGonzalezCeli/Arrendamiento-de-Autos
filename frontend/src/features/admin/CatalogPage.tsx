import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { ErrorAlert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { LoadingBlock } from '../../components/ui/Spinner'
import { formatMoney } from '../../lib/format'
import { useAdminMutation, useAdminQuery, type Category, type City, type Extra, type Rate, type Supplier } from './admin-api'
import { ActiveBadge, EntityForm, Modal, SectionHeader, TD, Table, rules, type FieldSpec } from './components'

const EXTRA_TYPES = { EQUIPMENT: 'Equipamiento', COVERAGE: 'Cobertura', SERVICE: 'Servicio' } as const
const DATE = /^\d{4}-\d{2}-\d{2}$/

interface CrudConfig<T extends { id: string | number }> {
  path: string
  noun: string
  columns: { head: string; cell: (row: T) => ReactNode }[]
  fields: FieldSpec[]
  empty: Record<string, unknown>
  editable?: boolean
  deletable?: boolean
  help?: string
}

/** Pestaña CRUD genérica: tabla + alta/edición en modal (+ borrado si aplica). */
function CrudTab<T extends { id: string | number }>({ path, noun, columns, fields, empty, editable = true, deletable = false, help }: CrudConfig<T>) {
  const rows = useAdminQuery<T[]>(path)
  const [editing, setEditing] = useState<T | 'new' | null>(null)
  const create = useAdminMutation('POST', path)
  const update = useAdminMutation<Record<string, unknown>>('PATCH', (b) => `${path}/${b.id}`)
  const remove = useAdminMutation<{ id: string | number }>('DELETE', (b) => `${path}/${b.id}`)

  async function save(values: Record<string, unknown>) {
    if (editing === 'new') await create.mutateAsync(values)
    else if (editing) await update.mutateAsync({ ...values, id: editing.id })
    setEditing(null)
  }

  const initial = editing && editing !== 'new'
    ? Object.fromEntries(Object.keys(empty).map((k) => [k, (editing as unknown as Record<string, unknown>)[k] ?? '']))
    : empty

  if (rows.isLoading) return <LoadingBlock />
  if (rows.error) return <ErrorAlert error={rows.error} />

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{help}</p>
        <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> Agregar {noun}</Button>
      </div>
      <Table head={[...columns.map((c) => c.head), '']} empty={!rows.data?.length}>
        {rows.data?.map((row) => (
          <tr key={row.id}>
            {columns.map((c) => <td key={c.head} className={TD}>{c.cell(row)}</td>)}
            <td className={`${TD} whitespace-nowrap text-right`}>
              {editable && (
                <button type="button" aria-label={`Editar ${noun}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => setEditing(row)}>
                  <Pencil className="h-4 w-4" />
                </button>
              )}
              {deletable && (
                <button
                  type="button"
                  aria-label={`Eliminar ${noun}`}
                  className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"
                  disabled={remove.isPending}
                  onClick={() => window.confirm(`¿Eliminar ${noun}?`) && remove.mutate({ id: row.id })}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </td>
          </tr>
        ))}
      </Table>
      {remove.error && <div className="mt-3"><ErrorAlert error={remove.error} /></div>}
      {editing && (
        <Modal title={editing === 'new' ? `Agregar ${noun}` : `Editar ${noun}`} onClose={() => setEditing(null)}>
          <EntityForm fields={fields} initial={initial} onSubmit={save} onCancel={() => setEditing(null)} />
        </Modal>
      )}
    </div>
  )
}

const TABS = ['Tarifas', 'Categorías', 'Extras', 'Proveedores', 'Ciudades'] as const

export function CatalogPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Tarifas')
  const categories = useAdminQuery<Category[]>('categories')
  const suppliers = useAdminQuery<Supplier[]>('suppliers')
  const categoryOptions = categories.data?.map((c) => ({ value: c.id, label: c.name }))
  const supplierOptions = suppliers.data?.map((s) => ({ value: s.id, label: s.name }))

  return (
    <div>
      <SectionHeader title="Catálogo y tarifas" subtitle="Datos comerciales que usan la búsqueda y el cálculo de precios." />
      <div role="tablist" className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            className={`-mb-px shrink-0 border-b-2 px-4 py-2 text-sm font-medium ${tab === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Tarifas' && (
        <CrudTab<Rate>
          path="rates"
          noun="tarifa"
          deletable
          help="Precio por día de cada categoría y proveedor, en USD sin IVA. Los periodos de una misma combinación no pueden superponerse."
          columns={[
            { head: 'Proveedor', cell: (r) => r.supplier.name },
            { head: 'Categoría', cell: (r) => r.category.name },
            { head: 'Precio por día', cell: (r) => <span className="font-semibold">{formatMoney(r.dailyRate, r.currency)}</span> },
            { head: 'Vigencia', cell: (r) => `${r.validFrom} → ${r.validTo}` },
          ]}
          empty={{ supplierId: '', categoryId: '', dailyRate: '', validFrom: '', validTo: '' }}
          fields={[
            { name: 'supplierId', label: 'Proveedor', type: 'select', numeric: true, required: true, options: supplierOptions },
            { name: 'categoryId', label: 'Categoría', type: 'select', required: true, options: categoryOptions },
            { name: 'dailyRate', label: 'Precio por día (USD)', type: 'number', step: '0.01', required: true, validate: rules.money(1, 10000) },
            { name: 'validFrom', label: 'Desde', type: 'date', required: true, validate: rules.pattern(DATE, 'Fecha inválida') },
            {
              name: 'validTo', label: 'Hasta', type: 'date', required: true,
              validate: (v, all) => (!DATE.test(String(v)) ? 'Fecha inválida' : String(v) < String(all.validFrom) ? 'Debe ser igual o posterior a "Desde"' : undefined),
            },
          ]}
        />
      )}

      {tab === 'Categorías' && (
        <CrudTab<Category>
          path="categories"
          noun="categoría"
          help="Grupos de vehículos (car_type del contrato) y la edad mínima del conductor para cada uno."
          columns={[
            { head: 'Código', cell: (c) => <span className="font-mono">{c.code}</span> },
            { head: 'Nombre', cell: (c) => c.name },
            { head: 'Edad mínima', cell: (c) => `${c.minDriverAge} años` },
            { head: 'Orden', cell: (c) => c.sortOrder },
          ]}
          empty={{ code: '', name: '', description: '', minDriverAge: 21, sortOrder: 10 }}
          fields={[
            { name: 'code', label: 'Código', required: true, placeholder: 'SUV', validate: rules.pattern(/^[A-Za-z_]{3,20}$/, 'Letras y _ (3–20)') },
            { name: 'name', label: 'Nombre', required: true, validate: rules.length(2, 60) },
            { name: 'minDriverAge', label: 'Edad mínima', type: 'number', required: true, validate: rules.integer(18, 99) },
            { name: 'sortOrder', label: 'Orden', type: 'number', required: true, validate: rules.integer(0, 100) },
            { name: 'description', label: 'Descripción', type: 'textarea', validate: rules.length(0, 300) },
          ]}
        />
      )}

      {tab === 'Extras' && (
        <CrudTab<Extra>
          path="extras"
          noun="extra"
          help="Equipamiento, coberturas y servicios que el cliente agrega a la reserva."
          columns={[
            { head: 'Código', cell: (e) => <span className="font-mono">{e.code}</span> },
            { head: 'Nombre', cell: (e) => e.name },
            { head: 'Tipo', cell: (e) => EXTRA_TYPES[e.type as keyof typeof EXTRA_TYPES] ?? e.type },
            { head: 'Precio', cell: (e) => `${formatMoney(e.pricePerDay, 'USD')}/día${e.maxPrice !== null ? ` (máx. ${formatMoney(e.maxPrice, 'USD')})` : ''}` },
            { head: 'Estado', cell: (e) => <ActiveBadge active={e.active} /> },
          ]}
          empty={{ code: '', name: '', description: '', type: 'EQUIPMENT', pricePerDay: '', maxPrice: '', active: true }}
          fields={[
            { name: 'code', label: 'Código', required: true, placeholder: 'GPS', validate: rules.pattern(/^[A-Za-z_]{2,30}$/, 'Letras y _ (2–30)') },
            { name: 'name', label: 'Nombre', required: true, validate: rules.length(2, 80) },
            { name: 'type', label: 'Tipo', type: 'select', required: true, options: Object.entries(EXTRA_TYPES).map(([value, label]) => ({ value, label })) },
            { name: 'pricePerDay', label: 'Precio por día (USD)', type: 'number', step: '0.01', required: true, validate: rules.money(0, 1000) },
            { name: 'maxPrice', label: 'Tope por alquiler (USD)', type: 'number', step: '0.01', hint: 'Opcional', validate: rules.money(0, 10000) },
            { name: 'description', label: 'Descripción', type: 'textarea', validate: rules.length(0, 300) },
            { name: 'active', label: 'Disponible para reservar', type: 'checkbox' },
          ]}
        />
      )}

      {tab === 'Proveedores' && (
        <CrudTab<Supplier>
          path="suppliers"
          noun="proveedor"
          help="Empresas de alquiler que operan las agencias (supplier del contrato)."
          columns={[
            { head: 'Código', cell: (s) => <span className="font-mono">{s.code}</span> },
            { head: 'Nombre', cell: (s) => s.name },
            { head: 'Estado', cell: (s) => <ActiveBadge active={s.active} /> },
          ]}
          empty={{ code: '', name: '', logoUrl: '', active: true }}
          fields={[
            { name: 'code', label: 'Código', required: true, placeholder: 'ANDES', validate: rules.pattern(/^[A-Za-z]{2,10}$/, 'Solo letras (2–10)') },
            { name: 'name', label: 'Nombre', required: true, validate: rules.length(2, 100) },
            { name: 'logoUrl', label: 'Logo', full: true, placeholder: 'https://…', validate: rules.pattern(/^(https:\/\/\S+|\/[\w./-]+)$/, 'URL https') },
            { name: 'active', label: 'Activo', type: 'checkbox' },
          ]}
        />
      )}

      {tab === 'Ciudades' && (
        <CrudTab<City>
          path="cities"
          noun="ciudad"
          editable={false}
          help="Ciudades donde hay agencias (búsqueda por ciudad del contrato)."
          columns={[
            { head: 'Nombre', cell: (c) => c.name },
            { head: 'País', cell: (c) => c.countryCode.toUpperCase() },
          ]}
          empty={{ name: '', countryCode: 'ec' }}
          fields={[
            { name: 'name', label: 'Nombre', required: true, validate: rules.pattern(/^[\p{L} .'-]{2,80}$/u, 'Solo letras') },
            { name: 'countryCode', label: 'País (ISO 3166, 2 letras)', required: true, validate: rules.pattern(/^[A-Za-z]{2}$/, '2 letras (ej. ec)') },
          ]}
        />
      )}
    </div>
  )
}
