import { Fuel } from 'lucide-react'
import { useState } from 'react'
import { Alert, ErrorAlert } from '../../components/ui/Alert'
import { LoadingBlock } from '../../components/ui/Spinner'
import { formatDateTime } from '../../lib/format'
import { useAdminMutation, useAdminQuery } from './admin-api'
import { EntityForm, rules, type FieldSpec } from './components'

interface ChargeSettings {
  fuelPriceExtra: number
  fuelPriceSuper: number
  fuelPriceDiesel: number
  refuelServiceFee: number
  cleaningBasic: number
  cleaningDeep: number
  damageDeductible: number
  updatedAt: string
  updatedBy: string | null
}

const price3 = (v: unknown) => {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0 || n > 50) return 'Entre 0,01 y 50'
  return Math.abs(n * 1000 - Math.round(n * 1000)) < 1e-6 ? undefined : 'Máximo 3 decimales'
}

const FIELDS: FieldSpec[] = [
  { name: 'fuelPriceExtra', label: 'Galón Extra / Ecopaís (USD)', type: 'number', step: '0.001', required: true, validate: price3, hint: 'Precio regulado' },
  { name: 'fuelPriceSuper', label: 'Galón Súper (USD)', type: 'number', step: '0.001', required: true, validate: price3, hint: 'Precio libre: referencia Primax' },
  { name: 'fuelPriceDiesel', label: 'Galón Diésel (USD)', type: 'number', step: '0.001', required: true, validate: price3, hint: 'Precio regulado' },
  { name: 'refuelServiceFee', label: 'Servicio de recarga (USD)', type: 'number', step: '0.01', required: true, validate: rules.money(0, 1000), hint: '0 = solo el combustible' },
  { name: 'cleaningBasic', label: 'Limpieza normal (USD)', type: 'number', step: '0.01', required: true, validate: rules.money(0, 1000) },
  { name: 'cleaningDeep', label: 'Limpieza profunda (USD)', type: 'number', step: '0.01', required: true, validate: rules.money(0, 1000) },
  { name: 'damageDeductible', label: 'Deducible por daños (USD)', type: 'number', step: '0.01', required: true, validate: rules.money(0, 100000), hint: 'Con cobertura total (CDW) el cliente paga $0' },
]

/** RN28: precios del galón (cambian el 12 de cada mes) y tarifas de cargos de devolución. Sin IVA. */
export function ChargeSettingsTab() {
  const settings = useAdminQuery<ChargeSettings>('charge-settings')
  const save = useAdminMutation<Record<string, unknown>, ChargeSettings>('PUT', 'charge-settings')
  const [saved, setSaved] = useState(false)

  if (settings.isLoading) return <LoadingBlock />
  if (settings.error || !settings.data) return <ErrorAlert error={settings.error} />
  const { updatedAt, updatedBy: _by, ...initial } = settings.data

  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-start gap-2 text-sm text-slate-500">
        <Fuel className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
        Se usan en la inspección de devolución: combustible faltante (octavos de tanque × galones del tanque del modelo × precio del galón),
        limpieza y daños hasta el deducible. Valores sin IVA. Los precios del combustible en Ecuador se actualizan el 12 de cada mes.
      </p>
      {saved && <Alert tone="success">Tarifas actualizadas.</Alert>}
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <EntityForm key={updatedAt} fields={FIELDS} initial={initial} submitLabel="Guardar tarifas" onCancel={() => setSaved(false)}
          onSubmit={async (values) => { await save.mutateAsync(values); setSaved(true) }} />
        <p className="mt-3 text-xs text-slate-400">Última actualización: {formatDateTime(updatedAt)}</p>
      </div>
    </div>
  )
}
