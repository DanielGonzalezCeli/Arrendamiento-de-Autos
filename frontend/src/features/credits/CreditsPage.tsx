import { ExternalLink } from 'lucide-react'
import { Card, PageContainer } from '../../components/ui/Card'
import credits from './image-credits.json'

/**
 * Atribución de las fotografías (Wikimedia Commons). Las licencias Creative Commons BY y BY-SA
 * permiten usarlas citando autor, fuente y licencia; esta página cumple ese requisito.
 */
export function CreditsPage() {
  return (
    <PageContainer title="Créditos de imágenes" subtitle="Fotografías de Wikimedia Commons usadas bajo licencias Creative Commons.">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {credits.map((c) => (
          <Card key={c.image} className="overflow-hidden">
            <img src={c.image} alt={c.vehicle} className="h-40 w-full object-cover" loading="lazy" />
            <div className="p-4 text-sm">
              <p className="font-semibold text-slate-800">{c.vehicle}</p>
              <p className="text-slate-600">Autor: {c.author}</p>
              <p className="text-slate-600">
                Licencia:{' '}
                {c.licenseUrl ? <a href={c.licenseUrl} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">{c.license}</a> : c.license}
              </p>
              <a href={c.source} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-brand-600 hover:underline">
                Ver original <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </Card>
        ))}
      </div>
      <p className="mt-6 text-xs text-slate-500">
        Las imágenes se muestran redimensionadas, sin otras modificaciones. Representan el modelo de referencia; el vehículo entregado puede ser de otro color o uno similar de la misma categoría.
      </p>
    </PageContainer>
  )
}
