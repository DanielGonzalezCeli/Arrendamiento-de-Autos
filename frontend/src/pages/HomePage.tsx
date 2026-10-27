import { ArrowRight, BadgeCheck, CalendarX2, Clock3, KeyRound, MapPinned, Search, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { CarIllustration } from '../components/CarIllustration'
import { Skeleton } from '../components/ui/Spinner'
import { useCategories } from '../features/catalog/queries'
import { criteriaToParams, defaultCriteria } from '../features/search/search-criteria'
import { SearchForm } from '../features/search/SearchForm'
import { ecuadorDate } from '../lib/datetime'

/** Las tres ciudades con aeropuerto donde operan las agencias (datos del catálogo). */
const DESTINATIONS = [
  { code: 'UIO', city: 'Quito', airport: 'Aeropuerto Mariscal Sucre', altitude: '2 850 m', tagline: 'Capital andina y puerta a la Avenida de los Volcanes.' },
  { code: 'CUE', city: 'Cuenca', airport: 'Aeropuerto Mariscal Lamar', altitude: '2 560 m', tagline: 'Centro histórico, Cajas y los valles del sur.' },
  { code: 'GYE', city: 'Guayaquil', airport: 'Aeropuerto José Joaquín de Olmedo', altitude: '4 m', tagline: 'El puerto principal y la Ruta del Spondylus.' },
]

/** Foto representativa de cada categoría (imágenes con licencia, ver /creditos). */
const CATEGORY_PHOTO: Record<string, string> = {
  ECONOMY: '/cars/kia-picanto.jpg',
  COMPACT: '/cars/chevrolet-onix.jpg',
  SEDAN: '/cars/toyota-corolla-hybrid.jpg',
  SUV: '/cars/kia-sportage.jpg',
  PICKUP: '/cars/toyota-hilux.jpg',
  VAN: '/cars/hyundai-h1.jpg',
}

const STEPS = [
  { icon: Search, title: 'Busca y compara', text: 'Modelos y proveedores con el precio total del alquiler, IVA incluido.' },
  { icon: Clock3, title: 'Te guardamos el auto', text: 'Al elegirlo lo bloqueamos 15 minutos mientras completas tus datos y el pago.' },
  { icon: KeyRound, title: 'Retira con tu voucher', text: 'Presenta tu código de reserva y tu licencia en el mostrador de la agencia.' },
]

const PROMISES = [
  { icon: BadgeCheck, title: 'Precio final claro', text: 'Total con IVA y extras antes de confirmar.' },
  { icon: CalendarX2, title: 'Cancelación gratuita', text: 'Hasta 24 horas antes de la recogida.' },
  { icon: ShieldCheck, title: 'Cobertura total opcional', text: 'Deducible de $0 por un valor diario.' },
  { icon: MapPinned, title: 'Aeropuerto y ciudad', text: 'Recoge y devuelve en la agencia que prefieras.' },
]

export function HomePage() {
  const navigate = useNavigate()
  const categories = useCategories()

  const quickSearch = (code: string) =>
    navigate(`/buscar?${criteriaToParams({ ...defaultCriteria(), pickup: `airport:${code}`, fromDate: ecuadorDate(7), toDate: ecuadorDate(10) })}`, { viewTransition: true })

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="topo relative overflow-hidden bg-asphalt-900 text-white">
        <div className="pointer-events-none absolute -top-40 -right-32 h-[28rem] w-[28rem] rounded-full bg-brand-500/25 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-48 -left-24 h-96 w-96 rounded-full bg-accent-500/10 blur-3xl" aria-hidden="true" />

        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pt-12 pb-36 md:pt-16 lg:grid-cols-[1.05fr_1fr] lg:pb-40">
          <div>
            <p className="stagger inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-stone-200" style={{ '--i': 0 } as React.CSSProperties}>
              <span className="h-1.5 w-1.5 rounded-full bg-accent-400" /> Quito · Cuenca · Guayaquil
            </p>
            <h1 className="stagger mt-5 text-4xl leading-[1.05] font-extrabold sm:text-5xl lg:text-6xl" style={{ '--i': 1 } as React.CSSProperties}>
              Del páramo al Pacífico,{' '}
              <span className="relative whitespace-nowrap text-accent-400">
                a tu ritmo
                <svg viewBox="0 0 200 12" className="absolute -bottom-2 left-0 w-full" aria-hidden="true">
                  <path d="M2 8 Q 60 2 100 6 T 198 5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" pathLength={1} strokeDasharray="1" className="animate-draw" />
                </svg>
              </span>
              .
            </h1>
            <p className="stagger mt-6 max-w-lg text-lg text-stone-300" style={{ '--i': 2 } as React.CSSProperties}>
              Compara autos de varios proveedores, con el precio final a la vista, y recógelo en el aeropuerto o en la ciudad.
            </p>
            <ul className="stagger mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm text-stone-300" style={{ '--i': 3 } as React.CSSProperties}>
              <li className="flex items-center gap-2"><CalendarX2 className="h-4 w-4 text-accent-400" /> Cancelación gratis hasta 24 h antes</li>
              <li className="flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-accent-400" /> IVA incluido en el total</li>
            </ul>
          </div>

          <RouteMap />
        </div>
      </section>

      {/* ── Buscador: "pase de ruta" que se superpone al hero ───────────────── */}
      <div className="relative z-10 mx-auto -mt-28 max-w-6xl px-4">
        <div className="animate-rise rounded-3xl bg-white p-2 shadow-2xl shadow-asphalt-900/15 ring-1 ring-stone-200" style={{ animationDelay: '250ms' }}>
          <div className="flex items-center justify-between gap-3 rounded-t-2xl px-4 pt-3 pb-2">
            <h2 className="font-display text-lg font-bold text-asphalt-900">Planifica tu ruta</h2>
            <div className="road-line hidden w-32 sm:block" aria-hidden="true" />
          </div>
          <div className="px-4 pb-4">
            <SearchForm />
          </div>
        </div>
      </div>

      {/* ── Destinos ──────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 pt-20 pb-6">
        <SectionTitle eyebrow="Destinos" title="Tres aeropuertos, tres paisajes" subtitle="Busca autos disponibles para la próxima semana en un clic." />
        <div className="grid gap-4 md:grid-cols-3">
          {DESTINATIONS.map((d, i) => (
            <button key={d.code} type="button" onClick={() => quickSearch(d.code)} style={{ '--i': i } as React.CSSProperties}
              className="stagger group relative overflow-hidden rounded-2xl bg-brand-800 p-6 text-left text-white transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-brand-900/25">
              <div className="topo absolute inset-0 opacity-70 transition duration-500 group-hover:scale-110" aria-hidden="true" />
              <div className="relative">
                <div className="flex items-start justify-between">
                  <span className="font-display text-5xl font-extrabold tracking-tight text-white/95">{d.code}</span>
                  <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-stone-200">{d.altitude}</span>
                </div>
                <p className="mt-6 font-display text-xl font-bold">{d.city}</p>
                <p className="text-sm text-brand-100/80">{d.airport}</p>
                <p className="mt-3 text-sm text-stone-200/90">{d.tagline}</p>
                <p className="mt-6 flex items-center gap-2 text-sm font-semibold text-accent-300">
                  Ver autos disponibles <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* ── Categorías (del catálogo real) ───────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <SectionTitle eyebrow="La flota" title="Un auto para cada tipo de viaje" subtitle="Categorías reales del catálogo, con la edad mínima del conductor para cada una." />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {categories.isLoading && Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-48" />)}
          {categories.data?.map((category, i) => (
            <article key={category.code} style={{ '--i': i } as React.CSSProperties}
              className="stagger group overflow-hidden rounded-2xl border border-stone-200 bg-white transition duration-300 hover:-translate-y-1 hover:shadow-lg">
              <div className="aspect-[4/3] overflow-hidden bg-stone-100">
                <CarIllustration category={category.code} imageUrl={CATEGORY_PHOTO[category.code]} alt={`Auto de categoría ${category.name}`}
                  className="transition duration-500 group-hover:scale-105" />
              </div>
              <div className="p-3">
                <h3 className="font-display font-bold text-asphalt-900">{category.name}</h3>
                <p className="mt-0.5 text-xs text-slate-500">Desde {category.minDriverAge} años</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ── Cómo funciona ────────────────────────────────────────────────── */}
      <section className="topo bg-brand-800 text-white">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <SectionTitle eyebrow="Cómo funciona" title="Tres paradas y estás en camino" tone="light" />
          <ol className="relative grid gap-8 md:grid-cols-3">
            <div className="road-line absolute top-6 right-[16%] left-[16%] hidden md:block" aria-hidden="true" />
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="relative flex flex-col items-center text-center">
                <span className="relative grid h-12 w-12 place-items-center rounded-full bg-accent-500 text-asphalt-900 ring-8 ring-brand-800">
                  <Icon className="h-5 w-5" />
                </span>
                <p className="mt-4 text-xs font-semibold tracking-[0.14em] text-accent-300 uppercase">Paso {i + 1}</p>
                <p className="mt-1 font-display text-lg font-bold">{title}</p>
                <p className="mt-2 max-w-xs text-sm text-brand-100/80">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Promesas ─────────────────────────────────────────────────────── */}
      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-14 sm:grid-cols-2 lg:grid-cols-4">
        {PROMISES.map(({ icon: Icon, title, text }) => (
          <div key={title} className="flex gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><Icon className="h-5 w-5" /></span>
            <div>
              <p className="font-semibold text-asphalt-900">{title}</p>
              <p className="text-sm text-slate-500">{text}</p>
            </div>
          </div>
        ))}
      </section>
    </>
  )
}

function SectionTitle({ eyebrow, title, subtitle, tone = 'dark' }: { eyebrow: string; title: string; subtitle?: string; tone?: 'dark' | 'light' }) {
  return (
    <div className="mb-8">
      <p className={`text-xs font-semibold tracking-[0.14em] uppercase ${tone === 'light' ? 'text-accent-300' : 'text-accent-600'}`}>{eyebrow}</p>
      <h2 className={`mt-1 text-2xl font-bold md:text-3xl ${tone === 'light' ? 'text-white' : 'text-asphalt-900'}`}>{title}</h2>
      {subtitle && <p className={`mt-2 text-sm ${tone === 'light' ? 'text-brand-100/80' : 'text-slate-500'}`}>{subtitle}</p>}
    </div>
  )
}

/**
 * Mapa esquemático (no a escala) con la ruta Quito → Cuenca → Guayaquil que se dibuja al cargar,
 * y una foto real de la flota.
 */
function RouteMap() {
  const route = 'M250 70 C 230 140, 270 190, 236 260 S 120 300, 96 238'
  return (
    <div className="relative mx-auto w-full max-w-[19rem] animate-pop sm:max-w-md lg:max-w-none" style={{ animationDelay: '150ms' }}>
      <svg viewBox="0 0 360 340" className="w-full" role="img" aria-label="Ruta esquemática entre Quito, Cuenca y Guayaquil">
        {/* Silueta muy simplificada del Ecuador continental */}
        <path d="M150 30 L290 40 L320 120 L300 220 L260 300 L170 320 L110 290 L60 250 L50 170 L90 90 Z"
          fill="var(--color-brand-800)" fillOpacity="0.55" stroke="white" strokeOpacity="0.12" strokeWidth="1.5" />
        <path d={route} fill="none" stroke="var(--color-asphalt-700)" strokeWidth="14" strokeLinecap="round" />
        <path d={route} fill="none" stroke="var(--color-accent-400)" strokeWidth="3" strokeLinecap="round" pathLength={1} strokeDasharray="1" className="animate-draw" />
        <path d={route} fill="none" stroke="var(--color-asphalt-900)" strokeWidth="1.2" strokeDasharray="6 8" className="animate-road" />
        {[
          { x: 250, y: 70, code: 'UIO', name: 'Quito', anchor: 'start' as const, dx: 14 },
          { x: 236, y: 260, code: 'CUE', name: 'Cuenca', anchor: 'start' as const, dx: 14 },
          { x: 96, y: 238, code: 'GYE', name: 'Guayaquil', anchor: 'end' as const, dx: -14 },
        ].map((p) => (
          <g key={p.code}>
            <circle cx={p.x} cy={p.y} r="11" fill="var(--color-accent-400)" fillOpacity="0.25" />
            <circle cx={p.x} cy={p.y} r="5.5" fill="white" />
            <text x={p.x + p.dx} y={p.y - 2} textAnchor={p.anchor} className="fill-white font-display text-[15px] font-bold">{p.code}</text>
            <text x={p.x + p.dx} y={p.y + 14} textAnchor={p.anchor} className="fill-stone-300 text-[11px]">{p.name}</text>
          </g>
        ))}
      </svg>

      <figure className="absolute top-0 -left-2 hidden w-52 -rotate-3 overflow-hidden rounded-2xl border-4 border-white bg-white shadow-2xl transition duration-500 hover:rotate-0 sm:block lg:-left-10 lg:w-56">
        <div className="aspect-[4/3]">
          <CarIllustration category="SUV" imageUrl="/cars/toyota-fortuner.jpg" alt="Toyota Fortuner de la flota" />
        </div>
        <figcaption className="px-3 py-2 text-xs text-slate-600">
          <span className="font-semibold text-asphalt-900">Toyota Fortuner</span> o similar · SUV
        </figcaption>
      </figure>
    </div>
  )
}
