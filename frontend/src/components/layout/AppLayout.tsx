import { CalendarCheck, LayoutDashboard, LogOut, Menu, Search, UserRound, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../features/auth/AuthContext'
import { ApiStatusBadge } from '../../features/system/ApiStatusBadge'
import { Logo } from '../Logo'

const NAV_LINK = ({ isActive }: { isActive: boolean }) =>
  `relative flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200 ${
    isActive ? 'text-brand-800 after:absolute after:inset-x-3 after:-bottom-[13px] after:h-[3px] after:rounded-full after:bg-accent-500' : 'text-slate-600 hover:text-asphalt-900'
  }`

const MOBILE_LINK = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-xl px-4 py-3 text-base font-medium ${isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-700 hover:bg-stone-100'}`

interface NavItem {
  to: string
  label: string
  icon: ReactNode
  end?: boolean
}

export function AppLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  // El menú móvil se cierra al navegar.
  useEffect(() => setMenuOpen(false), [location.pathname])

  const items: NavItem[] = [
    { to: '/', label: 'Buscar', icon: <Search className="h-4 w-4" />, end: true },
    ...(user ? [{ to: '/mis-reservas', label: 'Mis reservas', icon: <CalendarCheck className="h-4 w-4" /> }] : []),
    ...(user?.role === 'ADMIN' ? [{ to: '/admin', label: 'Administración', icon: <LayoutDashboard className="h-4 w-4" /> }] : []),
  ]

  const onLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2">
        Saltar al contenido
      </a>
      <header className="sticky top-0 z-30 border-b border-stone-200/80 bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Link to="/" viewTransition aria-label="RutaLibre, inicio">
            <Logo />
          </Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Principal">
            {items.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} viewTransition className={NAV_LINK}>
                {item.icon} {item.label}
              </NavLink>
            ))}
            {user ? (
              <div className="ml-3 flex items-center gap-2 border-l border-stone-300 pl-4">
                <span className="flex items-center gap-2 text-sm text-slate-700">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-100 font-semibold text-brand-800">
                    {user.firstName.charAt(0).toUpperCase()}
                  </span>
                  {user.firstName}
                </span>
                <button type="button" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={onLogout}
                  className="rounded-lg p-2 text-slate-500 transition hover:bg-stone-200/70 hover:text-asphalt-900">
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <Link to="/ingresar" viewTransition
                className="ml-3 rounded-xl bg-brand-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-800 active:scale-[0.97]">
                Ingresar
              </Link>
            )}
          </nav>

          <button type="button" className="rounded-lg p-2 text-asphalt-900 md:hidden" aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={menuOpen} aria-controls="menu-movil" onClick={() => setMenuOpen((open) => !open)}>
            {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {menuOpen && (
          <nav id="menu-movil" aria-label="Principal" className="animate-rise border-t border-stone-200 bg-paper px-4 pt-3 pb-5 md:hidden">
            {items.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={MOBILE_LINK}>{item.icon} {item.label}</NavLink>
            ))}
            {user ? (
              <button type="button" onClick={onLogout} className="mt-1 flex w-full items-center gap-3 rounded-xl px-4 py-3 text-base font-medium text-slate-700 hover:bg-stone-100">
                <LogOut className="h-4 w-4" /> Cerrar sesión ({user.firstName})
              </button>
            ) : (
              <NavLink to="/ingresar" className={MOBILE_LINK}><UserRound className="h-4 w-4" /> Ingresar</NavLink>
            )}
          </nav>
        )}
      </header>

      <main id="contenido" className="flex-1">
        <Outlet />
      </main>

      <footer className="topo bg-asphalt-900 text-stone-300">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Logo tone="light" />
            <p className="mt-3 max-w-sm text-sm text-stone-400">
              Alquiler de autos en Ecuador: compara modelos y proveedores, y recoge en el aeropuerto o en la ciudad.
            </p>
          </div>
          <div>
            <p className="font-display text-sm font-semibold text-white">Explora</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link to="/" className="hover:text-accent-400">Buscar un auto</Link></li>
              <li><Link to="/mis-reservas" className="hover:text-accent-400">Mis reservas</Link></li>
              <li><Link to="/creditos" className="hover:text-accent-400">Créditos de imágenes</Link></li>
            </ul>
          </div>
          <div>
            <p className="font-display text-sm font-semibold text-white">Estado del servicio</p>
            <div className="mt-3"><ApiStatusBadge /></div>
          </div>
        </div>
        <div className="border-t border-white/10">
          <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-stone-500">
            RutaLibre · Proyecto académico de Integración de Sistemas (PUCE). Los pagos son simulados: no se cobra ninguna tarjeta.
          </p>
        </div>
      </footer>
    </div>
  )
}
