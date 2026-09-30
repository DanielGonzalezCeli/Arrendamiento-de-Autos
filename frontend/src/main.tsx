import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider, ScrollRestoration, Outlet } from 'react-router-dom'

import { AppLayout } from './components/layout/AppLayout'
import { AdminLayout } from './features/admin/AdminLayout'
import { CatalogPage } from './features/admin/CatalogPage'
import { DashboardPage } from './features/admin/DashboardPage'
import { DepotsPage } from './features/admin/DepotsPage'
import { FleetPage } from './features/admin/FleetPage'
import { IntegrationPage } from './features/admin/IntegrationPage'
import { ModelsPage } from './features/admin/ModelsPage'
import { ReservationAdminPage } from './features/admin/ReservationAdminPage'
import { ReservationsPage } from './features/admin/ReservationsPage'
import { UsersPage } from './features/admin/UsersPage'
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
import { NotFoundPage } from './pages/SimplePages'

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
          {
            path: '/admin',
            element: <RequireAuth role="ADMIN"><AdminLayout /></RequireAuth>,
            children: [
              { index: true, element: <DashboardPage /> },
              { path: 'reservas', element: <ReservationsPage /> },
              { path: 'reservas/:id', element: <ReservationAdminPage /> },
              { path: 'modelos', element: <ModelsPage /> },
              { path: 'flota', element: <FleetPage /> },
              { path: 'agencias', element: <DepotsPage /> },
              { path: 'catalogo', element: <CatalogPage /> },
              { path: 'usuarios', element: <UsersPage /> },
              { path: 'integracion', element: <IntegrationPage /> },
            ],
          },
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
