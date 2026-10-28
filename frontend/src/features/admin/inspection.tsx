import { Fuel, Plus, Trash2 } from 'lucide-react'
import { INPUT_CLASS } from '../../components/ui/Field'
import { formatDateTime, formatMoney } from '../../lib/format'

/** RN28 — tipos y piezas de la inspección de entrega/devolución en el panel. */
export type FuelGrade = 'EXTRA' | 'SUPER' | 'DIESEL'
export type Cleanliness = 'CLEAN' | 'DIRTY' | 'VERY_DIRTY'
export type Severity = 'MINOR' | 'MODERATE' | 'SEVERE'

export interface Damage { zone: string; severity: Severity; description: string; estimatedCost: number }
export interface ChargeLine { code: string; description: string; quantity: number; unitPrice: number; subtotal: number }

export interface Inspection {
  id: string
  kind: 'PICKUP' | 'RETURN'
  fuelEighths: number
  mileage: number
  cleanliness: Cleanliness | null
  damages: Damage[]
  notes: string | null
  performedAt: string
  charges: ChargeLine[]
  chargeNotes: string[]
  chargesSubtotal: number
  invoiceId: string | null
  maintenanceDue: boolean
}

export interface ReturnPreview {
  charges: { lines: ChargeLine[]; subtotal: number; notes: string[]; missingEighths: number; lateDays: number; hasSevereDamage: boolean }
  fuel: { grade: FuelGrade; tankLiters: number; policy: string; pricePerGallon: number; pickupEighths: number | null }
  hasFullCoverage: boolean
  maintenanceDue: boolean
  nextMaintenanceKm: number
}

export const FUEL_LABEL: Record<FuelGrade, string> = { EXTRA: 'Extra', SUPER: 'Súper', DIESEL: 'Diésel' }
export const CLEAN_LABEL: Record<Cleanliness, string> = { CLEAN: 'Limpio', DIRTY: 'Sucio', VERY_DIRTY: 'Muy sucio' }
export const SEVERITY_LABEL: Record<Severity, string> = { MINOR: 'Leve', MODERATE: 'Moderado', SEVERE: 'Grave' }
const FRACTION = ['Vacío', '1/8', '1/4', '3/8', '1/2', '5/8', '3/4', '7/8', 'Lleno']

/** Medidor de combustible en octavos: se toca el segmento correspondiente. */
export function FuelGauge({ value, onChange, reference }: { value: number; onChange: (v: number) => void; reference?: number | null }) {
  return (
    <div>
      <div className="flex items-center gap-1" role="radiogroup" aria-label="Nivel de combustible">
        <Fuel className="mr-1 h-4 w-4 shrink-0 text-slate-400" />
        {Array.from({ length: 9 }, (_, i) => (
          <button key={i} type="button" role="radio" aria-checked={value === i} aria-label={FRACTION[i]} onClick={() => onChange(i)}
            className={`h-7 flex-1 rounded-md border transition ${i === 0 ? 'max-w-7' : ''} ${i <= value && value > 0 && i > 0
              ? value <= 2 ? 'border-rose-400 bg-rose-400' : value <= 4 ? 'border-accent-400 bg-accent-400' : 'border-brand-500 bg-brand-500'
              : 'border-stone-200 bg-stone-100 hover:bg-stone-200'} ${value === i ? 'ring-2 ring-asphalt-900/20' : ''}`} />
        ))}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Nivel: <b className="text-asphalt-900">{FRACTION[value]}</b>
        {reference !== undefined && reference !== null && <> · en la entrega: {FRACTION[reference]}</>}
      </p>
    </div>
  )
}

/** Lista editable de daños (zona, gravedad, descripción, costo estimado). */
export function DamagesEditor({ value, onChange, withCost = true }: { value: Damage[]; onChange: (v: Damage[]) => void; withCost?: boolean }) {
  const set = (i: number, patch: Partial<Damage>) => onChange(value.map((d, j) => (j === i ? { ...d, ...patch } : d)))
  return (
    <div className="flex flex-col gap-2">
      {value.map((d, i) => (
        <div key={i} className="grid gap-2 rounded-xl border border-stone-200 p-3 sm:grid-cols-[1fr_8rem]">
          <input aria-label="Zona del daño" className={INPUT_CLASS} placeholder="Zona (p. ej. parachoques delantero)" value={d.zone} onChange={(e) => set(i, { zone: e.target.value })} />
          <select aria-label="Gravedad" className={INPUT_CLASS} value={d.severity} onChange={(e) => set(i, { severity: e.target.value as Severity })}>
            {(Object.keys(SEVERITY_LABEL) as Severity[]).map((s) => <option key={s} value={s}>{SEVERITY_LABEL[s]}</option>)}
          </select>
          <input aria-label="Descripción del daño" className={INPUT_CLASS} placeholder="Descripción" value={d.description} onChange={(e) => set(i, { description: e.target.value })} />
          <div className="flex gap-2">
            {withCost && (
              <input aria-label="Costo estimado (USD)" type="number" min={0} step="0.01" className={INPUT_CLASS} placeholder="Costo $" value={d.estimatedCost || ''}
                onChange={(e) => set(i, { estimatedCost: Number(e.target.value) || 0 })} />
            )}
            <button type="button" aria-label="Quitar daño" className="rounded-lg px-2 text-rose-600 hover:bg-rose-50" onClick={() => onChange(value.filter((_, j) => j !== i))}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
      <button type="button" className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
        onClick={() => onChange([...value, { zone: '', severity: 'MINOR', description: '', estimatedCost: 0 }])}>
        <Plus className="h-4 w-4" /> Agregar daño
      </button>
    </div>
  )
}

/** Daños completos (zona y descripción) — los incompletos no se envían. */
export const completeDamages = (list: Damage[]) => list.filter((d) => d.zone.trim().length >= 2 && d.description.trim().length >= 2)

/** Entrega vs devolución, lado a lado, con los cargos cobrados. */
export function InspectionsSummary({ inspections, currency }: { inspections: Inspection[]; currency: string }) {
  if (!inspections.length) return <p className="text-sm text-slate-500">Se registra al entregar y al recibir el vehículo.</p>
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {inspections.map((i) => (
        <div key={i.id} className="rounded-xl border border-stone-200 p-4 text-sm">
          <p className="text-xs font-semibold tracking-wide text-accent-600 uppercase">{i.kind === 'PICKUP' ? 'Entrega' : 'Devolución'}</p>
          <p className="font-semibold text-asphalt-900">{formatDateTime(i.performedAt)}</p>
          <ul className="mt-2 space-y-0.5 text-slate-600">
            <li>Combustible: <b>{FRACTION[i.fuelEighths]}</b> · Kilometraje: <b>{i.mileage.toLocaleString('es-EC')} km</b></li>
            {i.cleanliness && <li>Limpieza: <b>{CLEAN_LABEL[i.cleanliness]}</b></li>}
            <li>{i.kind === 'PICKUP' ? 'Daños previos' : 'Daños nuevos'}: {i.damages.length ? i.damages.map((d) => `${d.zone} (${SEVERITY_LABEL[d.severity].toLowerCase()})`).join(', ') : 'ninguno'}</li>
            {i.notes && <li className="italic">“{i.notes}”</li>}
          </ul>
          {i.kind === 'RETURN' && (
            <div className="mt-3 border-t border-stone-100 pt-2">
              {i.charges.length ? (
                <>
                  {i.charges.map((c) => <p key={c.code} className="flex justify-between gap-2 text-slate-600"><span>{c.description}</span><span>{formatMoney(c.subtotal, currency)}</span></p>)}
                  <p className="mt-1 flex justify-between font-semibold text-asphalt-900"><span>Cargos (sin IVA)</span><span>{formatMoney(i.chargesSubtotal, currency)}</span></p>
                </>
              ) : <p className="font-semibold text-emerald-700">Devuelto sin cargos.</p>}
              {i.chargeNotes.map((n) => <p key={n} className="text-xs text-slate-500">{n}</p>)}
              {i.maintenanceDue && <p className="text-xs font-semibold text-amber-700">Mantenimiento por kilometraje: la unidad pasó a taller.</p>}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
