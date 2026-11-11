/** Una muestra del formato de texto de Prometheus: nombre{etiquetas} valor. */
export interface Sample {
  name: string
  labels: Record<string, string>
  value: number
}

const LINE = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{(.*)\})?\s+(\S+)/
const LABEL = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g

/** Lee el texto de /metrics (ignora comentarios # HELP / # TYPE). */
export function parsePrometheus(text: string): Sample[] {
  const samples: Sample[] = []
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue
    const match = LINE.exec(line)
    if (!match) continue
    const labels: Record<string, string> = {}
    for (const [, key, value] of (match[2] ?? '').matchAll(LABEL)) labels[key] = value.replace(/\\(.)/g, '$1')
    samples.push({ name: match[1], labels, value: Number(match[3]) })
  }
  return samples
}

export function sum(samples: Sample[], name: string, filter: (labels: Record<string, string>) => boolean = () => true): number {
  return samples.filter((s) => s.name === name && filter(s.labels)).reduce((total, s) => total + s.value, 0)
}

/**
 * Percentil aproximado (en segundos) de un histograma, sumando todas sus series: el límite del primer bucket que
 * acumula al menos ese porcentaje de las observaciones. null si no hay observaciones.
 */
export function histogramQuantile(samples: Sample[], name: string, quantile: number): number | null {
  const byLe = new Map<number, number>()
  for (const s of samples) {
    if (s.name !== `${name}_bucket`) continue
    const le = s.labels.le === '+Inf' ? Infinity : Number(s.labels.le)
    byLe.set(le, (byLe.get(le) ?? 0) + s.value)
  }
  const buckets = [...byLe.entries()].sort(([a], [b]) => a - b)
  const total = buckets.at(-1)?.[1] ?? 0
  if (!total) return null
  const target = quantile * total
  return buckets.find(([, count]) => count >= target)?.[0] ?? null
}
