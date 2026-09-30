import { Compass } from 'lucide-react'
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
