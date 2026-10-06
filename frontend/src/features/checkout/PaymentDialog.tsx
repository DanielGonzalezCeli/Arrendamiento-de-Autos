import { CheckCircle2, CreditCard, Loader2, Lock, ShieldCheck } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Field, Input } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { ApiError } from '../../lib/api'
import { formatMoney } from '../../lib/format'
import {
  BRANDS, TEST_CARDS, detectBrand, formatCardNumber, formatExpiry, onlyDigits, tokenizeCard, validateCardNumber, validateCvv, validateExpiry,
} from '../../lib/payment-card'
import { collectErrors, sanitizeNameInput, validateName } from '../../lib/validation'
import type { Reservation } from '../../lib/types'

type Step = 'form' | 'processing' | 'approved'
type CardField = 'number' | 'holder' | 'expiry' | 'cvv'

const PROCESSING_STEPS = ['Validando la tarjeta', 'Contactando al banco emisor', 'Autorizando el pago']
const MIN_PROCESSING_MS = 1800
const APPROVED_PAUSE_MS = 1300
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

interface PaymentDialogProps {
  amount: number
  currency: string
  defaultHolder: string
  disabled: boolean
  /** Envía el token al backend (confirmar = autorizar el pago + crear la reserva). */
  onPay: (paymentToken: string) => Promise<Reservation>
  onApproved: (reservation: Reservation) => void
  onClose: () => void
}

/**
 * Pasarela de pagos SIMULADA ("RutaPay"). Valida la tarjeta y la tokeniza en el navegador; solo el token
 * viaja al backend. Un rechazo (402) se muestra aquí y permite reintentar con otra tarjeta.
 */
export function PaymentDialog({ amount, currency, defaultHolder, disabled, onPay, onApproved, onClose }: PaymentDialogProps) {
  const [step, setStep] = useState<Step>('form')
  const [card, setCard] = useState({ number: '', holder: defaultHolder, expiry: '', cvv: '' })
  const [touched, setTouched] = useState<Partial<Record<CardField, boolean>>>({})
  const [submitted, setSubmitted] = useState(false)
  const [declined, setDeclined] = useState<string | null>(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [reference, setReference] = useState('')

  const brand = detectBrand(card.number)
  const errors = collectErrors<CardField>({
    number: validateCardNumber(card.number),
    holder: validateName(card.holder, 'nombre del titular'),
    expiry: validateExpiry(card.expiry),
    cvv: validateCvv(card.cvv, card.number),
  })
  const errorFor = (field: CardField) => (submitted || touched[field] ? errors[field] : undefined)
  const touch = (field: CardField) => () => setTouched((t) => ({ ...t, [field]: true }))

  useEffect(() => {
    if (step !== 'processing') return
    const timer = setInterval(() => setStepIndex((i) => Math.min(i + 1, PROCESSING_STEPS.length - 1)), MIN_PROCESSING_MS / PROCESSING_STEPS.length)
    return () => clearInterval(timer)
  }, [step])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (Object.keys(errors).length || disabled) return

    setDeclined(null)
    setStepIndex(0)
    setStep('processing')
    const started = Date.now()
    let reservation: Reservation | null = null
    let failure: unknown = null
    try {
      reservation = await onPay(tokenizeCard(card.number))
    } catch (error) {
      failure = error
    }
    const remaining = MIN_PROCESSING_MS - (Date.now() - started)
    if (remaining > 0) await delay(remaining)

    if (reservation) {
      setReference(reservation.payment?.reference ?? '')
      setStep('approved')
      await delay(APPROVED_PAUSE_MS)
      onApproved(reservation)
      return
    }
    if (failure instanceof ApiError && failure.status === 402) {
      // Rechazo del banco: se queda en la pasarela para probar otra tarjeta
      setDeclined(failure.message)
      setCard((c) => ({ ...c, cvv: '' }))
      setSubmitted(false)
      setTouched({})
      setStep('form')
      return
    }
    // Cualquier otro error (datos del conductor, disponibilidad, red): se muestra en el checkout
    onClose()
  }

  const fill = (number: string) => {
    setCard((c) => ({ ...c, number, expiry: c.expiry || '12/30', cvv: '' }))
    setDeclined(null)
  }

  return (
    <Modal
      locked={step !== 'form'}
      onClose={onClose}
      title={<span className="flex items-center gap-2"><Lock className="h-4 w-4 text-emerald-600" /> RutaPay · Pago seguro</span>}
    >
      {step === 'approved' ? (
        <div role="status" className="flex flex-col items-center gap-3 py-8 text-center">
          <CheckCircle2 className="h-14 w-14 text-emerald-500" />
          <p className="text-lg font-semibold text-slate-900">Pago aprobado</p>
          <p className="text-sm text-slate-500">{formatMoney(amount, currency)} · {brand ? BRANDS[brand].label : 'Tarjeta'} •••• {onlyDigits(card.number).slice(-4)}</p>
          {reference && <p className="font-mono text-xs text-slate-400">Ref. {reference}</p>}
          <p className="text-sm text-slate-500">Confirmando tu reserva…</p>
        </div>
      ) : step === 'processing' ? (
        <div role="status" aria-live="polite" className="flex flex-col items-center gap-4 py-8">
          <Loader2 className="h-12 w-12 animate-spin text-brand-600" />
          <p className="font-semibold text-slate-900">Procesando el pago de {formatMoney(amount, currency)}</p>
          <ol className="flex flex-col gap-1.5 text-sm">
            {PROCESSING_STEPS.map((label, i) => (
              <li key={label} className={`flex items-center gap-2 ${i <= stepIndex ? 'text-slate-700' : 'text-slate-300'}`}>
                {i < stepIndex ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <span className={`h-2 w-2 rounded-full ${i === stepIndex ? 'animate-pulse bg-brand-500' : 'bg-slate-300'}`} />}
                {label}
              </li>
            ))}
          </ol>
          <p className="text-xs text-slate-400">No cierres esta ventana.</p>
        </div>
      ) : (
        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
            <span className="text-sm text-slate-600">Total a pagar</span>
            <span className="text-xl font-bold text-slate-900">{formatMoney(amount, currency)}</span>
          </div>

          <CardPreview number={card.number} holder={card.holder} expiry={card.expiry} />

          {declined && <Alert tone="error"><strong>Pago rechazado.</strong> {declined}</Alert>}
          {disabled && <Alert tone="error">El bloqueo del vehículo expiró. Cierra esta ventana y vuelve a bloquearlo.</Alert>}

          <Field label="Número de tarjeta" htmlFor="card-number" error={errorFor('number')}>
            <div className="relative">
              <Input
                id="card-number" inputMode="numeric" autoComplete="cc-number" placeholder="1234 5678 9012 3456"
                value={card.number} error={errorFor('number')} onBlur={touch('number')}
                onChange={(e) => { setCard({ ...card, number: formatCardNumber(e.target.value) }); setDeclined(null) }}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500">
                {brand ? BRANDS[brand].label : <CreditCard className="h-4 w-4" />}
              </span>
            </div>
          </Field>
          <Field label="Nombre del titular" htmlFor="card-holder" error={errorFor('holder')}>
            <Input
              id="card-holder" autoComplete="cc-name" placeholder="Como aparece en la tarjeta"
              value={card.holder} error={errorFor('holder')} onBlur={touch('holder')}
              onChange={(e) => setCard({ ...card, holder: sanitizeNameInput(e.target.value) })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Vencimiento" htmlFor="card-expiry" error={errorFor('expiry')}>
              <Input
                id="card-expiry" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/AA"
                value={card.expiry} error={errorFor('expiry')} onBlur={touch('expiry')}
                onChange={(e) => setCard({ ...card, expiry: formatExpiry(e.target.value) })}
              />
            </Field>
            <Field label="CVV" htmlFor="card-cvv" error={errorFor('cvv')} hint={brand === 'amex' ? '4 dígitos al frente' : '3 dígitos al reverso'}>
              <Input
                id="card-cvv" inputMode="numeric" autoComplete="cc-csc" type="password" placeholder={brand === 'amex' ? '••••' : '•••'}
                value={card.cvv} error={errorFor('cvv')} onBlur={touch('cvv')}
                onChange={(e) => setCard({ ...card, cvv: onlyDigits(e.target.value).slice(0, brand ? BRANDS[brand].cvv : 4) })}
              />
            </Field>
          </div>

          <Button type="submit" className="w-full" disabled={disabled}>
            <Lock className="h-4 w-4" /> Pagar {formatMoney(amount, currency)}
          </Button>

          <details className="rounded-xl border border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <summary className="cursor-pointer font-semibold">Entorno de pruebas · tarjetas para probar</summary>
            <p className="mt-2 text-xs">No se cobra dinero real. Usa cualquier titular, una fecha futura y cualquier CVV.</p>
            <ul className="mt-2 flex flex-col gap-1">
              {TEST_CARDS.map((t) => (
                <li key={t.number}>
                  <button type="button" className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1 text-left hover:bg-amber-100" onClick={() => fill(t.number)}>
                    <span className="font-mono">{t.number}</span>
                    <span className={`text-xs font-semibold ${t.outcome === 'approved' ? 'text-emerald-700' : 'text-rose-700'}`}>{t.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </details>

          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
            <ShieldCheck className="h-3.5 w-3.5" /> El número y el CVV no se envían a RutaLibre: la pasarela los convierte en un token.
          </p>
        </form>
      )}
    </Modal>
  )
}

function CardPreview({ number, holder, expiry }: { number: string; holder: string; expiry: string }) {
  const brand = detectBrand(number)
  const digits = onlyDigits(number)
  const masked = digits ? formatCardNumber(digits.padEnd(brand === 'amex' ? 15 : 16, '•')) : '•••• •••• •••• ••••'
  return (
    <div aria-hidden="true" className="relative h-40 overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 via-slate-700 to-brand-700 p-5 text-white shadow-md">
      <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/10" />
      <div className="flex items-center justify-between">
        <div className="h-7 w-10 rounded-md bg-gradient-to-br from-amber-200 to-amber-400" />
        <span className="text-sm font-bold tracking-wide">{brand ? BRANDS[brand].label : 'RutaPay'}</span>
      </div>
      <p className="mt-6 font-mono text-lg tracking-widest">{masked}</p>
      <div className="mt-3 flex justify-between text-xs uppercase">
        <span className="truncate pr-4">{holder.trim() || 'NOMBRE DEL TITULAR'}</span>
        <span>{expiry || 'MM/AA'}</span>
      </div>
    </div>
  )
}

