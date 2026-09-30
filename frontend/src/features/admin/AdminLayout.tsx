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
  `flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
    isActive ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'
  }`

/** Estructura del panel: menú lateral en escritorio y barra desplazable en móvil. */
export function AdminLayout() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 lg:flex-row">
      <aside className="lg:w-56 lg:shrink-0">
        <p className="mb-2 hidden px-3 text-xs font-semibold uppercase tracking-wide text-slate-400 lg:block">Administración</p>
        <nav aria-label="Panel de administración" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:sticky lg:top-20 lg:mx-0 lg:flex-col lg:px-0">
          {LINKS.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={LINK}>
              <Icon className="h-4 w-4" /> {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <section className="min-w-0 flex-1">
        <Outlet />
      </section>
    </div>
  )
}
