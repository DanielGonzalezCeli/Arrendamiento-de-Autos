import { Building2, CalendarCheck, Car, Gauge, Network, Tags, Users, Warehouse } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'

const LINKS = [
  { to: '/admin', label: 'Resumen', icon: Gauge, end: true },
  { to: '/admin/reservas', label: 'Reservas', icon: CalendarCheck },
  { to: '/admin/modelos', label: 'Modelos', icon: Car },
  { to: '/admin/flota', label: 'Flota', icon: Warehouse },
  { to: '/admin/agencias', label: 'Agencias', icon: Building2 },
  { to: '/admin/catalogo', label: 'Catálogo y tarifas', icon: Tags },
  { to: '/admin/usuarios', label: 'Usuarios', icon: Users },
  { to: '/admin/integracion', label: 'Integración', icon: Network },
]

const LINK = ({ isActive }: { isActive: boolean }) =>
  `flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition duration-200 ${
    isActive ? 'bg-accent-500 text-asphalt-900 shadow-sm' : 'text-stone-300 hover:bg-white/10 hover:text-white'
  }`

/** Estructura del panel: menú lateral en escritorio y barra desplazable en móvil. */
export function AdminLayout() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 lg:flex-row">
      <aside className="lg:w-60 lg:shrink-0">
        <div className="topo rounded-2xl bg-asphalt-900 p-2 lg:sticky lg:top-20 lg:p-3">
        <p className="mb-2 hidden px-3 pt-1 text-xs font-semibold tracking-[0.14em] text-accent-300 uppercase lg:block">Administración</p>
        <nav aria-label="Panel de administración" className="flex gap-1 overflow-x-auto lg:flex-col">
          {LINKS.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={LINK}>
              <Icon className="h-4 w-4" /> {label}
            </NavLink>
          ))}
        </nav>
        </div>
      </aside>
      <section className="min-w-0 flex-1 animate-fade">
        <Outlet />
      </section>
    </div>
  )
}
