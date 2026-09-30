import { KeyRound, RefreshCw, RotateCcw, Send, Webhook } from 'lucide-react'
import { useState } from 'react'
import { Alert, ErrorAlert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { LoadingBlock } from '../../components/ui/Spinner'
import { API_BASE_URL } from '../../lib/api'
import { formatDateTime } from '../../lib/format'
import { useAdminMutation, useAdminQuery, type IntegrationOverview } from './admin-api'
import { ActiveBadge, Pill, SectionHeader, TD, Table } from './components'

const DELIVERY_TONE: Record<string, 'green' | 'amber' | 'red' | 'slate'> = { SUCCEEDED: 'green', PENDING: 'slate', FAILED: 'amber', DEAD: 'red' }
const DELIVERY_LABEL: Record<string, string> = { SUCCEEDED: 'Entregado', PENDING: 'Pendiente', FAILED: 'Reintentando', DEAD: 'Agotado' }

type DispatchReport = Record<string, number>

export function IntegrationPage() {
  const data = useAdminQuery<IntegrationOverview>('integration', { refetchInterval: 15_000 })
  const dispatch = useAdminMutation<void, DispatchReport>('POST', 'integration/dispatch')
  const retry = useAdminMutation<{ id: string }, DispatchReport>('POST', (b) => `integration/deliveries/${b.id}/retry`)
  const [report, setReport] = useState<DispatchReport | null>(null)

  if (data.isLoading) return <LoadingBlock />
  if (data.error || !data.data) return <ErrorAlert error={data.error} />
  const { clients, subscriptions, deliveries, outbox } = data.data

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Integración con el Booking Hub"
        subtitle="Clientes OAuth2, suscripciones de webhooks y entregas de eventos (outbox → webhooks firmados con HMAC)."
        action={
          <Button variant="secondary" loading={dispatch.isPending} onClick={() => dispatch.mutate(undefined, { onSuccess: setReport })}>
            <Send className="h-4 w-4" /> Procesar ahora
          </Button>
        }
      />
      {report && <Alert tone="success">Ciclo ejecutado: {Object.entries(report).map(([k, v]) => `${k}: ${v}`).join(' · ')}</Alert>}
      {(dispatch.error || retry.error) && <ErrorAlert error={dispatch.error ?? retry.error} />}

      <div className="grid gap-4 md:grid-cols-3">
        <Info label="Eventos en el outbox" value={`${outbox.total}`} detail={`${outbox.pending} por publicar`} />
        <Info label="Suscripciones activas" value={`${subscriptions.filter((s) => s.active).length}`} detail={`${subscriptions.length} en total`} />
        <Info label="Documentación" value="OpenAPI · AsyncAPI" detail={<a className="text-brand-600 hover:underline" href={`${API_BASE_URL}/autos/v1/docs`} target="_blank" rel="noreferrer">Abrir Swagger del contrato</a>} />
      </div>

      <section>
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900"><KeyRound className="h-4 w-4" /> Clientes OAuth2 (client credentials)</h2>
        <Table head={['Client ID', 'Nombre', 'Afiliado', 'Scopes', 'Estado']} empty={!clients.length}>
          {clients.map((c) => (
            <tr key={c.clientId}>
              <td className={`${TD} font-mono`}>{c.clientId}</td>
              <td className={TD}>{c.name}</td>
              <td className={TD}>{c.affiliateId ?? '—'}</td>
              <td className={TD}><div className="flex flex-wrap gap-1">{c.scopes.map((s) => <Pill key={s}>{s}</Pill>)}</div></td>
              <td className={TD}><ActiveBadge active={c.active} /></td>
            </tr>
          ))}
        </Table>
        <p className="mt-2 text-xs text-slate-500">Los secretos se guardan con hash y nunca se muestran.</p>
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900"><Webhook className="h-4 w-4" /> Suscripciones de webhooks</h2>
        <Table head={['URL', 'Propietario', 'Eventos', 'Entregados', 'Con fallas', 'Estado']} empty={!subscriptions.length}>
          {subscriptions.map((s) => (
            <tr key={s.id}>
              <td className={`${TD} max-w-xs break-all font-mono text-xs`}>{s.url}</td>
              <td className={`${TD} font-mono text-xs`}>{s.ownerSub}</td>
              <td className={TD}><div className="flex flex-wrap gap-1">{s.events.map((e) => <Pill key={e} tone="blue">{e}</Pill>)}</div></td>
              <td className={TD}>{s.delivered}</td>
              <td className={TD}>{s.failed}</td>
              <td className={TD}><ActiveBadge active={s.active} /></td>
            </tr>
          ))}
        </Table>
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900"><RefreshCw className="h-4 w-4" /> Últimas entregas</h2>
        <Table head={['Evento', 'Destino', 'Intento', 'Respuesta', 'Fecha', 'Estado', '']} empty={!deliveries.length}>
          {deliveries.map((d) => (
            <tr key={d.id}>
              <td className={TD}><p className="font-medium">{d.eventType}</p><p className="font-mono text-xs text-slate-500">{d.resourceId}</p></td>
              <td className={`${TD} max-w-xs break-all font-mono text-xs`}>{d.url}</td>
              <td className={TD}>{d.attempt}</td>
              <td className={`${TD} text-xs`}>{d.responseCode ?? '—'}{d.lastError && <p className="max-w-xs truncate text-rose-600" title={d.lastError}>{d.lastError}</p>}</td>
              <td className={`${TD} whitespace-nowrap text-xs`}>
                {formatDateTime(d.deliveredAt ?? d.createdAt)}
                {d.nextAttemptAt && d.status === 'FAILED' && <p className="text-slate-500">Próximo: {formatDateTime(d.nextAttemptAt)}</p>}
              </td>
              <td className={TD}><Pill tone={DELIVERY_TONE[d.status]}>{DELIVERY_LABEL[d.status] ?? d.status}</Pill></td>
              <td className={`${TD} text-right`}>
                {(d.status === 'FAILED' || d.status === 'DEAD') && (
                  <button
                    type="button"
                    title="Reintentar ahora"
                    aria-label="Reintentar entrega"
                    className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                    disabled={retry.isPending}
                    onClick={() => retry.mutate({ id: d.id }, { onSuccess: setReport })}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </section>
    </div>
  )
}

function Info({ label, value, detail }: { label: string; value: string; detail: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
      <p className="text-sm text-slate-500">{detail}</p>
    </div>
  )
}
