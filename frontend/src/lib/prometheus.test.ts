import { describe, expect, it } from 'vitest'
import { histogramQuantile, parsePrometheus, sum } from './prometheus'

const TEXT = `# HELP http_requests_total Peticiones
# TYPE http_requests_total counter
http_requests_total{method="GET",route="/api/autos",status="200",service="ms-reservas"} 8
http_requests_total{method="POST",route="/api/v3/reservas",status="500",service="ms-reservas"} 2
http_request_duration_seconds_bucket{le="0.05",route="/a"} 6
http_request_duration_seconds_bucket{le="0.25",route="/a"} 9
http_request_duration_seconds_bucket{le="+Inf",route="/a"} 10
process_resident_memory_bytes{service="ms-reservas"} 52428800
`

describe('métricas Prometheus', () => {
  const samples = parsePrometheus(TEXT)

  it('lee nombre, etiquetas y valor e ignora los comentarios', () => {
    expect(samples).toHaveLength(6)
    expect(samples[0]).toEqual({ name: 'http_requests_total', labels: { method: 'GET', route: '/api/autos', status: '200', service: 'ms-reservas' }, value: 8 })
  })

  it('suma una métrica, con filtro por etiquetas', () => {
    expect(sum(samples, 'http_requests_total')).toBe(10)
    expect(sum(samples, 'http_requests_total', (l) => l.status.startsWith('5'))).toBe(2)
  })

  it('percentil de un histograma por buckets', () => {
    expect(histogramQuantile(samples, 'http_request_duration_seconds', 0.5)).toBe(0.05)
    expect(histogramQuantile(samples, 'http_request_duration_seconds', 0.9)).toBe(0.25)
    expect(histogramQuantile(samples, 'http_request_duration_seconds', 0.95)).toBe(Infinity)
    expect(histogramQuantile([], 'x', 0.95)).toBeNull()
  })
})
