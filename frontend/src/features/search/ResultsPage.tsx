import { ArrowRight, CalendarDays, CarFront, SlidersHorizontal, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ErrorAlert } from '../../components/ui/Alert'
import { Card, EmptyState, PageContainer } from '../../components/ui/Card'
import { formatDateTime, pluralize, TRANSMISSION_LABEL } from '../../lib/format'
import type { Offer } from '../../lib/types'
import { useSearch } from '../catalog/queries'
import { OfferCard, OfferCardSkeleton } from './OfferCard'
import { criteriaFromParams } from './search-criteria'
import { SearchForm } from './SearchForm'

type Sort = 'price-asc' | 'price-desc' | 'seats-desc'

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
          {!criteria && <EmptyState icon={<CarFront className="h-8 w-8" />} title="Empieza una búsqueda">Elige lugar y fechas en el formulario.</EmptyState>}
          {search.isLoading && (
            <div className="flex flex-col gap-4" role="status" aria-label="Buscando vehículos disponibles">
              <div className="skeleton mb-2 h-14 w-full" />
              {Array.from({ length: 3 }, (_, i) => <OfferCardSkeleton key={i} />)}
            </div>
          )}
          {search.isError && <ErrorAlert error={search.error} />}
          {search.data && (
            <>
              <div className="mb-4 flex animate-fade flex-wrap items-center justify-between gap-3 rounded-2xl bg-asphalt-900 px-5 py-4 text-white">
                <div>
                  <h1 className="text-xl font-bold">{pluralize(visible.length, 'vehículo disponible', 'vehículos disponibles')}</h1>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-stone-300">
                    <CalendarDays className="h-4 w-4 text-accent-400" />
                    {formatDateTime(search.data.pickupAt)} <ArrowRight className="h-3.5 w-3.5" /> {formatDateTime(search.data.dropoffAt)}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm text-stone-300">
                  Ordenar
                  <select className="rounded-lg border border-white/15 bg-asphalt-800 px-2 py-1.5 text-white" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                    <option value="price-asc">Precio: menor a mayor</option>
                    <option value="price-desc">Precio: mayor a menor</option>
                    <option value="seats-desc">Más asientos</option>
                  </select>
                </label>
              </div>
              <ActiveFilters filters={filters} onChange={setFilters} />
              {visible.length === 0 ? (
                <EmptyState icon={<CarFront className="h-8 w-8" />} title="No hay vehículos con esos criterios"
                  action={hasFilters(filters) ? <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} className="text-sm font-semibold text-brand-700 hover:underline">Quitar los filtros</button> : undefined}>
                  Prueba otras fechas u horas (las agencias tienen horario), otra ubicación o quita filtros.
                </EmptyState>
              ) : (
                <div className="flex flex-col gap-4">
                  {visible.map((offer, i) => <OfferCard key={offer.vehicle.id} offer={offer} index={i} searchToken={search.data.searchToken} />)}
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
    .sort((a, b) => sort === 'price-asc' ? a.price.total - b.price.total
      : sort === 'price-desc' ? b.price.total - a.price.total
        : b.vehicle.seats - a.vehicle.seats || a.price.total - b.price.total)
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
            <label key={value} className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-sm text-slate-700 transition hover:bg-stone-100">
              <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={filters[group.key].has(value)} onChange={() => toggle(group.key, value)} />
              {group.label?.(value) ?? value}
            </label>
          ))}
        </fieldset>
      ))}
    </Card>
  )
}

function hasFilters(filters: Filters): boolean {
  return filters.categories.size + filters.transmissions.size + filters.suppliers.size > 0
}

/** Chips de los filtros aplicados; cada uno se quita con un clic. */
function ActiveFilters({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  if (!hasFilters(filters)) return null
  const chips = (Object.keys(filters) as (keyof Filters)[]).flatMap((key) =>
    [...filters[key]].map((value) => ({ key, value, label: key === 'transmissions' ? TRANSMISSION_LABEL[value] : value })))
  const remove = (key: keyof Filters, value: string) => {
    const next = new Set(filters[key])
    next.delete(value)
    onChange({ ...filters, [key]: next })
  }
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {chips.map(({ key, value, label }) => (
        <button key={`${key}-${value}`} type="button" onClick={() => remove(key, value)}
          className="flex animate-pop items-center gap-1.5 rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-800 transition hover:bg-brand-200">
          {label} <X className="h-3 w-3" aria-label="Quitar" />
        </button>
      ))}
      <button type="button" onClick={() => onChange(EMPTY_FILTERS)} className="text-xs font-semibold text-slate-500 hover:text-asphalt-900">Limpiar todo</button>
    </div>
  )
}
