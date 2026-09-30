import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import type { Role } from '../../lib/types'
import { useAuth } from './AuthContext'

/**
 * Protege rutas en la UI (comodidad). La seguridad real está en el backend: sin token o sin rol
 * responde 401/403 aunque alguien fuerce la navegación.
 */
export function RequireAuth({ children, role }: { children: ReactNode; role?: Role }) {
  const { user } = useAuth()
  const location = useLocation()

  if (!user) {
    const back = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/ingresar?volver=${back}`} replace />
  }
  if (role && user.role !== role) return <Navigate to="/" replace />
  return <>{children}</>
}
