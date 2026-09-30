import { CarFront, LayoutDashboard, LogOut, UserRound } from 'lucide-react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../features/auth/AuthContext'
import { ApiStatusBadge } from '../../features/system/ApiStatusBadge'

const NAV_LINK = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`

export function AppLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Link to="/" className="flex items-center gap-2 text-xl font-bold tracking-tight text-brand-700">
            <CarFront className="h-6 w-6" />
            <span>Ruta<span className="text-accent-500">Libre</span></span>
          </Link>
          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={NAV_LINK}>Buscar</NavLink>
            {user && <NavLink to="/mis-reservas" className={NAV_LINK}>Mis reservas</NavLink>}
            {user?.role === 'ADMIN' && (
              <NavLink to="/admin" className={NAV_LINK}>
                <span className="flex items-center gap-1"><LayoutDashboard className="h-4 w-4" /> Admin</span>
              </NavLink>
            )}
            {user ? (
              <div className="ml-2 flex items-center gap-2 border-l border-slate-200 pl-3">
                <span className="hidden items-center gap-1.5 text-sm text-slate-600 sm:flex"><UserRound className="h-4 w-4" /> {user.firstName}</span>
                <button
                  type="button"
                  aria-label="Cerrar sesión"
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                  onClick={() => { logout(); navigate('/') }}
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <NavLink to="/ingresar" className={NAV_LINK}>Ingresar</NavLink>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-slate-500">
          <p>
            RutaLibre · Alquiler de autos en Ecuador — Proyecto de Integración de Sistemas (PUCE) ·{' '}
            <Link to="/creditos" className="hover:underline">Créditos de imágenes</Link>
          </p>
          <ApiStatusBadge />
        </div>
      </footer>
    </div>
  )
}
