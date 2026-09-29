import { Link, Outlet } from 'react-router-dom'
import { ApiStatusBadge } from '../../features/system/ApiStatusBadge'

export function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="text-xl font-bold tracking-tight text-brand-700">
            Ruta<span className="text-accent-500">Libre</span>
          </Link>
          <ApiStatusBadge />
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-sm text-slate-500">
        RutaLibre · Proyecto de Integración de Sistemas — PUCE
      </footer>
    </div>
  )
}
