import { CarFront, SlidersHorizontal } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ErrorAlert } from '../../components/ui/Alert'
import { Card, EmptyState, PageContainer } from '../../components/ui/Card'
import { LoadingBlock } from '../../components/ui/Spinner'
import { formatDateTime, pluralize, TRANSMISSION_LABEL } from '../../lib/format'
import type { Offer } from '../../lib/types'
import { useSearch } from '../catalog/queries'
import { OfferCard } from './OfferCard'
import { criteriaFromParams } from './search-criteria'
import { SearchForm } from './SearchForm'

type Sort = 'price-asc' | 'price-desc'

interface Filters {
  categories: Set<string>
  transmissions: Set<string>
  suppliers: Set<string>
}

const EMPTY_FILTERS: Filters = { categories: new Set(), transmissions: new Set(), suppliers: new Set() }

/** Resultados de búsqueda. Filtros y orden se aplican en el cliente sobre la respuesta del backend. */
export function ResultsPage() {
  const [params] = useSearchParams()
  const criteria = useMemo(() => criteriaFromParams(params), [params])
  const search = useSearch(criteria)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [sort, setSort] = useState<Sort>('price-asc')

  const offers = search.data?.offers ?? []
  const visible = useMemo(() => applyFilters(offers, filters, sort), [offers, filters, sort])

  return (
    <PageContainer>
      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        {/* En móvil los resultados van primero; en escritorio, el formulario a la izquierda. */}
        <aside className="order-2 flex flex-col gap-4 lg:order-1">
          <Card className="p-5">
            <h2 className="mb-4 font-semibold text-slate-800">Modificar búsqueda</h2>
            <SearchForm key={params.toString()} initial={criteria ?? undefined} compact />
          </Card>
          {offers.length > 0 && <FiltersPanel offers={offers} filters={filters} onChange={setFilters} />}
        </aside>

        <section className="order-1 lg:order-2">
          {!criteria && <EmptyState icon={<CarFront className="h-10 w-10" />} title="Empieza una búsqueda">Elige lugar y fechas en el formulario.</EmptyState>}
          {search.isLoading && <LoadingBlock label="Buscando vehículos disponibles…" />}
          {search.isError && <ErrorAlert error={search.error} />}
          {search.data && (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-xl font-bold text-slate-900">{pluralize(visible.length, 'vehículo disponible', 'vehículos disponibles')}</h1>
                  <p className="text-sm text-slate-500">
                    {formatDateTime(search.data.pickupAt)} → {formatDateTime(search.data.dropoffAt)}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  Ordenar
                  <select className="rounded-lg border border-slate-300 bg-white px-2 py-1.5" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                    <option value="price-asc">Precio: menor a mayor</option>
                    <option value="price-desc">Precio: mayor a menor</option>
                  </select>
                </label>
              </div>
              {visible.length === 0 ? (
                <EmptyState icon={<CarFront className="h-10 w-10" />} title="No hay vehículos con esos criterios">
                  Prueba otras fechas u horas (las agencias tienen horario), otra ubicación o quita filtros.
                </EmptyState>
              ) : (
                <div className="flex flex-col gap-4">
                  {visible.map((offer) => <OfferCard key={offer.vehicle.id} offer={offer} searchToken={search.data.searchToken} />)}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </PageContainer>
  )
}

function applyFilters(offers: Offer[], filters: Filters, sort: Sort): Offer[] {
  const matches = (set: Set<string>, value: string) => set.size === 0 || set.has(value)
  return offers
    .filter((o) => matches(filters.categories, o.vehicle.category.name)
      && matches(filters.transmissions, o.vehicle.transmission)
      && matches(filters.suppliers, o.vehicle.supplier.name))
    .sort((a, b) => (sort === 'price-asc' ? a.price.total - b.price.total : b.price.total - a.price.total))
}

function FiltersPanel({ offers, filters, onChange }: { offers: Offer[]; filters: Filters; onChange: (f: Filters) => void }) {
  const unique = (values: string[]) => [...new Set(values)].sort()
  const groups: { key: keyof Filters; title: string; values: string[]; label?: (v: string) => string }[] = [
    { key: 'categories', title: 'Categoría', values: unique(offers.map((o) => o.vehicle.category.name)) },
    { key: 'transmissions', title: 'Transmisión', values: unique(offers.map((o) => o.vehicle.transmission)), label: (v) => TRANSMISSION_LABEL[v] },
    { key: 'suppliers', title: 'Proveedor', values: unique(offers.map((o) => o.vehicle.supplier.name)) },
  ]

  function toggle(key: keyof Filters, value: string) {
    const next = new Set(filters[key])
    if (next.has(value)) next.delete(value)
    else next.add(value)
    onChange({ ...filters, [key]: next })
  }

  return (
    <Card className="p-5">
      <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-800">
        <SlidersHorizontal className="h-4 w-4" /> Filtros
      </h2>
      {groups.map((group) => (
        <fieldset key={group.key} className="mb-4 last:mb-0">
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{group.title}</legend>
          {group.values.map((value) => (
            <label key={value} className="flex items-center gap-2 py-0.5 text-sm text-slate-700">
              <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={filters[group.key].has(value)} onChange={() => toggle(group.key, value)} />
              {group.label?.(value) ?? value}
            </label>
          ))}
        </fieldset>
      ))}
    </Card>
  )
}
