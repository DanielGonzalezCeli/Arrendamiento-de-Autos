import { useQuery } from '@tanstack/react-query'
import { Activity, Boxes, CircleAlert, Gauge, MemoryStick, Timer } from 'lucide-react'
import type { ReactNode } from 'react'
import { ErrorAlert } from '../../components/ui/Alert'
import { Skeleton } from '../../components/ui/Spinner'
import { API_BASE_URL, apiFetchText } from '../../lib/api'
import { histogramQuantile, parsePrometheus, sum, type Sample } from '../../lib/prometheus'
import { Pill, SectionHeader, TD, Table } from './components'

/** Microservicios en el orden del recorrido de una petición. */
const SERVICES = [
  { key: 'gateway', name: 'API Gateway', role: 'Entrada única, enrutamiento, límite por IP' },
  { key: 'ms-reservas', name: 'ms-reservas', role: 'Catálogo, reservas, flota, contrato v3' },
  { key: 'ms-identidad', name: 'ms-identidad', role: 'Usuarios, login, JWT RS256' },
  { key: 'ms-clientes', name: 'ms-clientes', role: 'Clientes cross-platform (v3.1)' },
  { key: 'ms-inventario', name: 'ms-inventario', role: 'Stock a Booking por eventos (RabbitMQ)' },
] as const

type ServiceKey = (typeof SERVICES)[number]['key']

interface Health {
  status: 'HEALTHY' | 'DEGRADED'
  services: Record<string, { status: 'UP' | 'DOWN'; latency_ms: number; detail?: string }>
}

/** /gateway/health es público y responde 503 si algún servicio está caído: se lee igual. */
async function fetchHealth(): Promise<Health> {
  const response = await fetch(`${API_BASE_URL}/gateway/health`)
  return (await response.json()) as Health
}

async function fetchMetrics(): Promise<Record<ServiceKey, Sample[] | null>> {
  const entries = await Promise.all(SERVICES.map(async ({ key }) => {
    try {
      const text = await apiFetchText(key === 'gateway' ? '/gateway/metrics' : `/gateway/metrics/${key}`)
      return [key, parsePrometheus(text)] as const
    } catch {
      return [key, null] as const
    }
  }))
  return Object.fromEntries(entries) as Record<ServiceKey, Sample[] | null>
}

const ms = (seconds: number | null) => (seconds === null ? '—' : seconds === Infinity ? '> 10 s' : seconds < 1 ? `≤ ${Math.round(seconds * 1000)} ms` : `≤ ${seconds} s`)
const uptime = (startSeconds: number) => {
  const minutes = Math.max(0, Math.floor(Date.now() / 60_000 - startSeconds / 60))
  return minutes < 60 ? `${minutes} min` : minutes < 1440 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${Math.floor(minutes / 1440)} d`
}

/**
 * Observabilidad (fase E): salud y métricas Prometheus de cada microservicio, leídas a través del gateway (solo
 * ADMIN). Los contadores cuentan desde el último arranque de cada servicio.
 */
export function ObservabilityPage() {
  const health = useQuery({ queryKey: ['observability', 'health'], queryFn: fetchHealth, refetchInterval: 10_000 })
  const metrics = useQuery({ queryKey: ['observability', 'metrics'], queryFn: fetchMetrics, refetchInterval: 10_000 })

  if (health.isLoading || metrics.isLoading) {
    return (
      <div className="flex flex-col gap-6" role="status" aria-label="Cargando la observabilidad">
        <Skeleton className="h-9 w-72" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-44" />)}</div>
      </div>
    )
  }
  if (metrics.error || !metrics.data) return <ErrorAlert error={metrics.error} />
  const data = metrics.data
  const reservas = data['ms-reservas'] ?? []
  const inventario = data['ms-inventario'] ?? []
  const gateway = data.gateway ?? []

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Observabilidad"
        subtitle={<>Salud y métricas Prometheus de cada microservicio, a través del API Gateway (<code className="text-xs">/gateway/metrics/&#123;servicio&#125;</code>, solo administradores). Se actualiza cada 10 s.</>}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {SERVICES.map((service) => {
          const samples = data[service.key]
          const status = service.key === 'gateway' ? (health.data ? 'UP' : 'DOWN') : health.data?.services[service.key]?.status ?? 'DOWN'
          const latency = service.key === 'gateway' ? null : health.data?.services[service.key]?.latency_ms
          const requestsName = service.key === 'gateway' ? 'gateway_requests_total' : 'http_requests_total'
          const durationName = service.key === 'gateway' ? 'gateway_request_duration_seconds' : 'http_request_duration_seconds'
          const start = samples?.find((s) => s.name === 'process_start_time_seconds')?.value
          return (
            <section key={service.key} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-bold text-asphalt-900">{service.name}</h2>
                  <p className="text-xs text-slate-500">{service.role}</p>
                </div>
                <Pill tone={status === 'UP' ? 'green' : 'red'}>{status}{latency !== undefined && latency !== null ? ` · ${latency} ms` : ''}</Pill>
              </div>
              {samples ? (
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <Stat icon={<Activity className="h-4 w-4" />} label="Peticiones" value={sum(samples, requestsName).toLocaleString('es-EC')} />
                  <Stat icon={<CircleAlert className="h-4 w-4" />} label="Errores 5xx" value={sum(samples, requestsName, (l) => l.status?.startsWith('5')).toLocaleString('es-EC')} />
                  <Stat icon={<Timer className="h-4 w-4" />} label="Latencia p95" value={ms(histogramQuantile(samples, durationName, 0.95))} />
                  <Stat icon={<MemoryStick className="h-4 w-4" />} label="Memoria" value={`${Math.round(sum(samples, 'process_resident_memory_bytes') / 1_048_576)} MB`} />
                  {start !== undefined && <Stat icon={<Gauge className="h-4 w-4" />} label="Activo hace" value={uptime(start)} />}
                </dl>
              ) : (
                <p className="mt-4 text-sm text-rose-600">No respondió /metrics.</p>
              )}
            </section>
          )
        })}
      </div>

      <section>
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-asphalt-900"><Boxes className="h-4 w-4" /> Eventos y negocio</h2>
        <Table head={['Métrica', 'Servicio', 'Detalle', 'Valor']}>
          <Row label="Eventos de flota publicados en RabbitMQ" service="ms-reservas" samples={reservas} name="fleet_events_published_total" by="routing_key" />
          <Row label="Eventos de flota consumidos" service="ms-inventario" samples={inventario} name="fleet_events_consumed_total" by="result" />
          <Row label="Stock enviado a Booking (PushStockUpdate)" service="ms-inventario" samples={inventario} name="booking_stock_push_total" by="result" />
          <Row label="Inicios de sesión" service="ms-identidad" samples={data['ms-identidad'] ?? []} name="auth_logins_total" by="result" />
          <Row label="Altas de clientes" service="ms-clientes" samples={data['ms-clientes'] ?? []} name="clients_registrations_total" by="result" />
          <Row label="Rechazadas por límite (429)" service="gateway" samples={gateway} name="gateway_rate_limited_total" />
          <Row label="Microservicio caído o lento (502/504)" service="gateway" samples={gateway} name="gateway_upstream_errors_total" by="upstream" />
          <tr>
            <td className={TD}>Conexión con RabbitMQ</td>
            <td className={`${TD} text-xs`}>ms-reservas · ms-inventario</td>
            <td className={TD} />
            <td className={TD}>
              <div className="flex flex-wrap gap-1">
                {([['ms-reservas', reservas], ['ms-inventario', inventario]] as const).map(([name, s]) => (
                  <Pill key={name} tone={sum(s, 'rabbitmq_connected') ? 'green' : 'red'}>{name}: {sum(s, 'rabbitmq_connected') ? 'conectado' : 'desconectado'}</Pill>
                ))}
              </div>
            </td>
          </tr>
        </Table>
      </section>
    </div>
  )
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs text-slate-500">{icon}{label}</dt>
      <dd className="mt-0.5 font-semibold text-asphalt-900">{value}</dd>
    </div>
  )
}

/** Una fila por métrica, con el desglose por una etiqueta (p. ej. ok / error). */
function Row({ label, service, samples, name, by }: { label: string; service: string; samples: Sample[]; name: string; by?: string }) {
  const groups = new Map<string, number>()
  for (const s of samples.filter((x) => x.name === name)) {
    const key = by ? s.labels[by] ?? '—' : ''
    groups.set(key, (groups.get(key) ?? 0) + s.value)
  }
  const total = [...groups.values()].reduce((a, b) => a + b, 0)
  return (
    <tr>
      <td className={TD}>{label}</td>
      <td className={`${TD} text-xs`}>{service}</td>
      <td className={`${TD} text-xs text-slate-500`}>{by ? [...groups.entries()].map(([k, v]) => `${k}: ${v}`).join(' · ') || '—' : ''}</td>
      <td className={`${TD} font-semibold`}>{total.toLocaleString('es-EC')}</td>
    </tr>
  )
}
