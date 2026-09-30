import { BadgeCheck, CalendarX2, Clock3, Plane } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Card } from '../components/ui/Card'
import { ecuadorDate } from '../lib/datetime'
import { criteriaToParams, defaultCriteria } from '../features/search/search-criteria'
import { SearchForm } from '../features/search/SearchForm'

const DESTINATIONS = [
  { title: 'Quito', subtitle: 'Aeropuerto Mariscal Sucre', location: 'airport:UIO', gradient: 'from-sky-500 to-indigo-600' },
  { title: 'Guayaquil', subtitle: 'Aeropuerto José Joaquín de Olmedo', location: 'airport:GYE', gradient: 'from-amber-500 to-rose-500' },
  { title: 'Cuenca', subtitle: 'Aeropuerto Mariscal Lamar', location: 'airport:CUE', gradient: 'from-emerald-500 to-teal-600' },
]

const BENEFITS = [
  { icon: BadgeCheck, title: 'Precio final claro', text: 'Total con IVA y extras antes de confirmar.' },
  { icon: CalendarX2, title: 'Cancelación gratuita', text: 'Hasta 24 horas antes de la recogida.' },
  { icon: Clock3, title: 'Te guardamos el auto', text: 'Lo bloqueamos 15 minutos mientras completas la reserva.' },
  { icon: Plane, title: 'Aeropuerto y ciudad', text: 'Recoge y devuelve en la agencia que prefieras.' },
]

export function HomePage() {
  const navigate = useNavigate()

  const quickSearch = (location: string) =>
    navigate(`/buscar?${criteriaToParams({ ...defaultCriteria(), pickup: location, fromDate: ecuadorDate(7), toDate: ecuadorDate(10) })}`)

  return (
    <>
      <section className="bg-gradient-to-br from-brand-700 via-brand-600 to-brand-500 text-white">
        <div className="mx-auto max-w-6xl px-4 pt-14 pb-24">
          <h1 className="max-w-2xl text-4xl font-bold leading-tight md:text-5xl">Alquila el auto ideal para tu próximo viaje</h1>
          <p className="mt-4 max-w-xl text-lg text-brand-100">
            Compara modelos, proveedores y precios. Recoge en el aeropuerto o en la ciudad.
          </p>
        </div>
      </section>

      <div className="mx-auto -mt-16 max-w-6xl px-4">
        <Card className="p-6 shadow-xl">
          <SearchForm />
        </Card>
      </div>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="mb-6 text-2xl font-bold text-slate-900">Destinos populares</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {DESTINATIONS.map((d) => (
            <button
              key={d.location}
              type="button"
              onClick={() => quickSearch(d.location)}
              className={`group rounded-2xl bg-gradient-to-br ${d.gradient} p-6 text-left text-white shadow transition hover:-translate-y-0.5 hover:shadow-lg`}
            >
              <p className="text-2xl font-bold">{d.title}</p>
              <p className="text-sm text-white/80">{d.subtitle}</p>
              <p className="mt-6 text-sm font-semibold opacity-90 group-hover:underline">Ver autos para la próxima semana →</p>
            </button>
          ))}
        </div>
      </section>

      <section className="border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
          {BENEFITS.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex gap-3">
              <Icon className="h-6 w-6 shrink-0 text-brand-600" />
              <div>
                <p className="font-semibold text-slate-800">{title}</p>
                <p className="text-sm text-slate-500">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
