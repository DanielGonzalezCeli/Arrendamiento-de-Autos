import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider, ScrollRestoration, Outlet } from 'react-router-dom'

import { AppLayout } from './components/layout/AppLayout'
import { AuthProvider } from './features/auth/AuthContext'
import { LoginPage } from './features/auth/LoginPage'
import { RegisterPage } from './features/auth/RegisterPage'
import { RequireAuth } from './features/auth/RequireAuth'
import { CheckoutPage } from './features/checkout/CheckoutPage'
import { CreditsPage } from './features/credits/CreditsPage'
import { MyReservationsPage } from './features/reservations/MyReservationsPage'
import { ReservationDetailPage } from './features/reservations/ReservationDetailPage'
import { ResultsPage } from './features/search/ResultsPage'
import { VehicleDetailPage } from './features/vehicle/VehicleDetailPage'
import './index.css'
import { HomePage } from './pages/HomePage'
import { AdminPlaceholderPage, NotFoundPage } from './pages/SimplePages'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
})

/** AuthProvider necesita el QueryClient y el router (para redirigir), por eso va dentro de la ruta raíz. */
function Root() {
  return (
    <AuthProvider>
      <ScrollRestoration />
      <Outlet />
    </AuthProvider>
  )
}

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <HomePage /> },
          { path: '/buscar', element: <ResultsPage /> },
          { path: '/vehiculo/:id', element: <VehicleDetailPage /> },
          { path: '/ingresar', element: <LoginPage /> },
          { path: '/registro', element: <RegisterPage /> },
          { path: '/creditos', element: <CreditsPage /> },
          { path: '/reservar/:vehicleId', element: <RequireAuth><CheckoutPage /></RequireAuth> },
          { path: '/mis-reservas', element: <RequireAuth><MyReservationsPage /></RequireAuth> },
          { path: '/mis-reservas/:id', element: <RequireAuth><ReservationDetailPage /></RequireAuth> },
          { path: '/admin/*', element: <RequireAuth role="ADMIN"><AdminPlaceholderPage /></RequireAuth> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
