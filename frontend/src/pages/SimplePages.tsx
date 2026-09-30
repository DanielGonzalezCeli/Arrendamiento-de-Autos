import { Compass, Wrench } from 'lucide-react'
import { ButtonLink } from '../components/ui/Button'
import { EmptyState, PageContainer } from '../components/ui/Card'

export function NotFoundPage() {
  return (
    <PageContainer>
      <EmptyState icon={<Compass className="h-10 w-10" />} title="Página no encontrada">
        <ButtonLink to="/" className="mt-3">Ir al inicio</ButtonLink>
      </EmptyState>
    </PageContainer>
  )
}

/** Marcador del panel de administración (se implementa en la Fase 5). */
export function AdminPlaceholderPage() {
  return (
    <PageContainer title="Panel de administración">
      <EmptyState icon={<Wrench className="h-10 w-10" />} title="En construcción">
        El panel de administración (catálogo, flota, reservas y usuarios) llega en la siguiente fase.
      </EmptyState>
    </PageContainer>
  )
}
