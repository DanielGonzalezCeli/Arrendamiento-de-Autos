import { ReceiptText } from 'lucide-react'
import { Field, Input } from '../../components/ui/Field'
import { BUYER_ID_LABEL, FINAL_CONSUMER_MAX_TOTAL, type BuyerIdType } from '../../lib/sri'

export interface BillingInput {
  idType: BuyerIdType
  idNumber: string
  name: string
  address: string
  email: string
}

type BillingField = 'idType' | 'idNumber' | 'name'

const ID_TYPES: BuyerIdType[] = ['05', '04', '06', '07']

/**
 * Datos de la factura electrónica (RN27). Consumidor final solo se ofrece si el total no pasa de USD 50,
 * como exige el SRI; por encima hay que identificar al comprador con cédula, RUC o pasaporte.
 */
export function BillingForm({ value, onChange, total, errorFor, touch }: {
  value: BillingInput
  onChange: (next: BillingInput) => void
  total: number | null
  errorFor: (field: BillingField) => string | undefined
  touch: (field: BillingField) => () => void
}) {
  const finalConsumerAllowed = total !== null && total <= FINAL_CONSUMER_MAX_TOTAL
  const set = (patch: Partial<BillingInput>) => onChange({ ...value, ...patch })
  const isFinal = value.idType === '07'

  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="Tipo de identificación" className="flex flex-wrap gap-2">
        {ID_TYPES.map((type) => {
          const disabled = type === '07' && !finalConsumerAllowed
          const active = value.idType === type
          return (
            <button key={type} type="button" role="radio" aria-checked={active} disabled={disabled}
              onClick={() => set({ idType: type })}
              className={`rounded-xl border px-3.5 py-2 text-sm font-semibold transition ${active
                ? 'border-brand-600 bg-brand-50 text-brand-800 ring-2 ring-brand-500/20'
                : 'border-stone-300 bg-white text-slate-600 hover:border-stone-400'} disabled:cursor-not-allowed disabled:opacity-40`}>
              {BUYER_ID_LABEL[type]}
            </button>
          )
        })}
      </div>
      {!finalConsumerAllowed && (
        <p className="-mt-2 text-xs text-slate-500">
          El SRI no permite facturar a consumidor final montos mayores a USD {FINAL_CONSUMER_MAX_TOTAL}.
        </p>
      )}
      {errorFor('idType') && <p className="-mt-2 text-xs font-medium text-rose-600">{errorFor('idType')}</p>}

      {!isFinal && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`Número de ${BUYER_ID_LABEL[value.idType].toLowerCase()}`} htmlFor="billingId" error={errorFor('idNumber')}>
            <Input id="billingId" inputMode={value.idType === '06' ? 'text' : 'numeric'} autoComplete="off"
              maxLength={value.idType === '04' ? 13 : value.idType === '05' ? 10 : 20}
              value={value.idNumber} onChange={(e) => set({ idNumber: e.target.value.replace(value.idType === '06' ? /[^a-zA-Z0-9]/g : /\D/g, '') })}
              onBlur={touch('idNumber')} error={errorFor('idNumber')} />
          </Field>
          <Field label={value.idType === '04' ? 'Razón social' : 'Nombre completo'} htmlFor="billingName" error={errorFor('name')}>
            <Input id="billingName" autoComplete={value.idType === '04' ? 'organization' : 'name'} value={value.name}
              onChange={(e) => set({ name: e.target.value })} onBlur={touch('name')} error={errorFor('name')} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Dirección (opcional)" htmlFor="billingAddress">
              <Input id="billingAddress" autoComplete="street-address" value={value.address} onChange={(e) => set({ address: e.target.value })} />
            </Field>
          </div>
        </div>
      )}
      <p className="flex items-start gap-2 rounded-xl bg-stone-50 px-3 py-2.5 text-xs text-slate-500">
        <ReceiptText className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
        La factura electrónica se emite al confirmar el pago y queda disponible en Mis reservas (PDF y XML).
        Ambiente de pruebas del SRI: el comprobante no tiene validez tributaria.
      </p>
    </div>
  )
}
