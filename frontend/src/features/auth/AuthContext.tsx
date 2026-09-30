import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { apiFetch, configureAuth } from '../../lib/api'
import { readSession, removeSession, writeSession } from '../../lib/session-store'
import type { AuthResponse, User } from '../../lib/types'

const SESSION_KEY = 'rutalibre.session'

interface Session {
  accessToken: string
  user: User
}

export interface RegisterInput {
  email: string
  password: string
  firstName: string
  lastName: string
  phone?: string
}

interface AuthContextValue {
  user: User | null
  login: (email: string, password: string) => Promise<User>
  register: (input: RegisterInput) => Promise<User>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * Sesión del usuario web. El JWT vive en memoria + sessionStorage (se pierde al cerrar la pestaña).
 * Es el token de la API INTERNA; no sirve para la API de integración del Hub.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(() => readSession<Session>(SESSION_KEY))

  const logout = useCallback(() => {
    removeSession(SESSION_KEY)
    configureAuth(null, null)
    setSession(null)
    queryClient.removeQueries({ queryKey: ['me'] })
  }, [queryClient])

  // El cliente HTTP debe conocer el token antes del primer render de las páginas.
  configureAuth(session?.accessToken ?? null, logout)

  const start = useCallback((auth: AuthResponse) => {
    const next = { accessToken: auth.accessToken, user: auth.user }
    writeSession(SESSION_KEY, next)
    configureAuth(next.accessToken, logout)
    setSession(next)
    return auth.user
  }, [logout])

  const value = useMemo<AuthContextValue>(() => ({
    user: session?.user ?? null,
    login: async (email, password) => start(await apiFetch<AuthResponse>('/api/auth/login', { method: 'POST', body: { email, password } })),
    register: async (input) => start(await apiFetch<AuthResponse>('/api/auth/register', { method: 'POST', body: input })),
    logout,
  }), [session, start, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return context
}
