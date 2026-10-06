import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { ErrorAlert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Field, INPUT_CLASS } from '../../components/ui/Field'
import { ImageDropzone } from '../../components/ui/ImageDropzone'
import { PhoneInput } from '../../components/ui/PhoneInput'
import { ApiError } from '../../lib/api'

// ── Modal (compartido con el checkout) ───────────────────────────────────────
export { Modal } from '../../components/ui/Modal'

// ── Formulario configurable ──────────────────────────────────────────────────
export type FieldSpec = {
  name: string
  label: string
  type?: 'text' | 'number' | 'textarea' | 'select' | 'checkbox' | 'date' | 'phone' | 'image'
  options?: { value: string | number; label: string }[]
  /** Opciones que dependen de lo elegido en otros campos (tiene prioridad sobre `options`). */
  optionsFor?: (values: Record<string, unknown>) => { value: string | number; label: string }[] | undefined
  required?: boolean
  hint?: string
  placeholder?: string
  step?: string
  /** Validación en el navegador (el backend vuelve a validar todo). */
  validate?: (value: unknown, values: Record<string, unknown>) => string | undefined
  full?: boolean
  /** Select cuyos valores son números (ids enteros). */
  numeric?: boolean
}

type Values = Record<string, unknown>

/**
 * Formulario genérico del panel: los campos salen de una lista de FieldSpec. Muestra los errores de
 * campo que devuelve el backend (ProblemDetails.invalidParams) junto a cada input.
 */
export function EntityForm({
  fields,
  initial,
  submitLabel = 'Guardar',
  onSubmit,
  onCancel,
  children,
}: {
  fields: FieldSpec[]
  initial: Values
  submitLabel?: string
  onSubmit: (values: Values) => Promise<unknown>
  onCancel: () => void
  children?: (values: Values, set: (name: string, value: unknown) => void) => ReactNode
}) {
  const [values, setValues] = useState<Values>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<unknown>(null)
  const [saving, setSaving] = useState(false)
  const prefix = useId()

  const set = (name: string, value: unknown) => setValues((v) => ({ ...v, [name]: value }))

  function localErrors() {
    const found: Record<string, string> = {}
    for (const f of fields) {
      const value = values[f.name]
      if (f.required && (value === '' || value === null || value === undefined)) found[f.name] = 'Obligatorio'
      else if (f.validate && value !== '' && value !== null && value !== undefined) {
        const message = f.validate(value, values)
        if (message) found[f.name] = message
      }
    }
    return found
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const found = localErrors()
    setErrors(found)
    if (Object.keys(found).length) return
    setSaving(true)
    setError(null)
    try {
      await onSubmit(normalize(fields, values))
    } catch (err) {
      setError(err)
      if (err instanceof ApiError) {
        setErrors(Object.fromEntries(err.invalidParams.map((p) => [p.name.split('.')[0], p.reason])))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((f) => {
          const id = `${prefix}-${f.name}`
          const value = values[f.name]
          const err = errors[f.name]
          const common = {
            id,
            name: f.name,
            'aria-invalid': err ? true : undefined,
            'aria-describedby': err ? `${id}-error` : undefined,
            className: INPUT_CLASS,
          }
          if (f.type === 'checkbox') {
            return (
              <label key={f.name} className={`flex items-center gap-2 text-sm text-slate-700 ${f.full ? 'sm:col-span-2' : ''}`}>
                <input type="checkbox" id={id} className="h-4 w-4 rounded border-slate-300 text-brand-600" checked={Boolean(value)} onChange={(e) => set(f.name, e.target.checked)} />
                {f.label}
              </label>
            )
          }
          return (
            <div key={f.name} className={f.full || f.type === 'textarea' || f.type === 'phone' || f.type === 'image' ? 'sm:col-span-2' : ''}>
              <Field label={f.label + (f.required ? ' *' : '')} htmlFor={id} error={err} hint={f.hint}>
                {f.type === 'select' ? (
                  <select {...common} value={String(value ?? '')} onChange={(e) => set(f.name, e.target.value)}>
                    <option value="">Selecciona…</option>
                    {(f.optionsFor?.(values) ?? f.options)?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : f.type === 'textarea' ? (
                  <textarea {...common} rows={3} value={String(value ?? '')} onChange={(e) => set(f.name, e.target.value)} />
                ) : f.type === 'image' ? (
                  <ImageDropzone id={id} value={String(value ?? '')} onChange={(v) => set(f.name, v)} error={err} />
                ) : f.type === 'phone' ? (
                  <PhoneInput id={id} value={String(value ?? '')} onChange={(v) => set(f.name, v)} error={err} />
                ) : (
                  <input
                    {...common}
                    type={f.type ?? 'text'}
                    step={f.step}
                    placeholder={f.placeholder}
                    value={String(value ?? '')}
                    onChange={(e) => set(f.name, e.target.value)}
                  />
                )}
              </Field>
            </div>
          )
        })}
      </div>
      {children?.(values, set)}
      {error !== null && <ErrorAlert error={error} />}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" loading={saving}>{submitLabel}</Button>
      </div>
    </form>
  )
}

/** Convierte los valores del formulario a los tipos que espera el backend (números, null en opcionales vacíos). */
function normalize(fields: FieldSpec[], values: Values): Values {
  const out: Values = { ...values }
  for (const f of fields) {
    const v = values[f.name]
    if (f.type === 'number' || f.numeric) {
      out[f.name] = v === '' || v === null || v === undefined ? null : Number(v)
    } else if (typeof v === 'string') {
      out[f.name] = v.trim() === '' && !f.required ? null : v.trim()
    }
    if (out[f.name] === null && f.required) delete out[f.name]
  }
  return out
}

// ── Tabla y piezas pequeñas ──────────────────────────────────────────────────
/** Encabezado de columna: texto, o { label, className } para ocultarla en pantallas pequeñas. */
type Head = ReactNode | { label: ReactNode; className: string }

export function Table({ head, children, empty }: { head: Head[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {head.map((h, i) => {
              const col = h && typeof h === 'object' && 'label' in h ? h : { label: h as ReactNode, className: '' }
              return <th key={i} className={`px-3 py-3 font-semibold first:pl-4 last:pr-4 ${col.className}`}>{col.label}</th>
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {empty ? (
            <tr><td colSpan={head.length} className="px-4 py-10 text-center text-slate-400">Sin registros</td></tr>
          ) : children}
        </tbody>
      </table>
    </div>
  )
}

export const TD = 'px-3 py-3 align-middle text-slate-700 first:pl-4 last:pr-4'

type PillTone = 'green' | 'amber' | 'red' | 'slate' | 'blue'
const PILL: Record<PillTone, string> = {
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-rose-50 text-rose-700',
  slate: 'bg-slate-100 text-slate-600',
  blue: 'bg-brand-50 text-brand-700',
}

export function Pill({ tone = 'slate', children }: { tone?: PillTone; children: ReactNode }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${PILL[tone]}`}>{children}</span>
}

export function ActiveBadge({ active, on = 'Activo', off = 'Inactivo' }: { active: boolean; on?: string; off?: string }) {
  return <Pill tone={active ? 'green' : 'slate'}>{active ? on : off}</Pill>
}

export function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function StatCard({ label, value, icon, tone = 'text-brand-600' }: { label: string; value: ReactNode; icon: ReactNode; tone?: string }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className={`rounded-xl bg-slate-50 p-3 ${tone}`}>{icon}</div>
      <div>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      </div>
    </div>
  )
}

/** Validaciones comunes del panel (mismas reglas que los DTO del backend). */
export const rules = {
  pattern: (re: RegExp, message: string) => (v: unknown) => (re.test(String(v).trim()) ? undefined : message),
  range: (min: number, max: number) => (v: unknown) => {
    const n = Number(v)
    return Number.isFinite(n) && n >= min && n <= max ? undefined : `Entre ${min} y ${max}`
  },
  integer: (min: number, max: number) => (v: unknown) => {
    const n = Number(v)
    return Number.isInteger(n) && n >= min && n <= max ? undefined : `Número entero entre ${min} y ${max}`
  },
  money: (min: number, max: number) => (v: unknown) => {
    const n = Number(v)
    if (!Number.isFinite(n) || n < min || n > max) return `Entre ${min} y ${max}`
    return Math.abs(n * 100 - Math.round(n * 100)) < 1e-6 ? undefined : 'Máximo 2 decimales'
  },
  length: (min: number, max: number) => (v: unknown) => {
    const len = String(v).trim().length
    return len >= min && len <= max ? undefined : `Entre ${min} y ${max} caracteres`
  },
}
