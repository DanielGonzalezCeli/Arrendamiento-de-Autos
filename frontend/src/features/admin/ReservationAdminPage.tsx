import { ArrowDownToLine, ArrowLeft, ArrowUpFromLine, Ban, Ticket } from 'lucide-react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useDeferredValue, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Alert, ErrorAlert } from '../../components/ui/Alert'
import { Button, ButtonLink } from '../../components/ui/Button'
import { Field, INPUT_CLASS } from '../../components/ui/Field'
import { LoadingBlock } from '../../components/ui/Spinner'
import { apiFetch } from '../../lib/api'
import { formatDateTime, formatMoney } from '../../lib/format'
import { describeCard } from '../../lib/payment-card'
import { InvoiceList } from '../invoices/InvoiceList'
import { StatusBadge } from '../reservations/StatusBadge'
import { CHANNEL_LABEL, useAdminMutation, useAdminQuery, type AdminReservation } from './admin-api'
import { Modal, Pill } from './components'
import { CLEAN_LABEL, completeDamages, DamagesEditor, FUEL_LABEL, FuelGauge, InspectionsSummary, type Cleanliness, type Damage, type ReturnPreview } from './inspection'

const ACTION_LABEL: Record<string, string> = {
  CREATED: 'Reserva creada',
  MODIFIED: 'Reserva modificada',
  CANCELLED: 'Reserva cancelada',
  PICKED_UP: 'Vehículo entregado',
  RETURNED: 'Vehículo devuelto',
}

function actorLabel(sub: string) {
  if (sub.startsWith('admin:')) return 'Administrador'
  if (sub.startsWith('user:')) return 'Cliente (web)'
  return 'Booking Hub'
}

export function ReservationAdminPage() {
  const { id = '' } = useParams()
  const { data: r, isLoading, error } = useAdminQuery<AdminReservation>(`reservations/${id}`)
  const [dialog, setDialog] = useState<'pickup' | 'return' | 'cancel' | null>(null)
  const [done, setDone] = useState<string | null>(null)

  if (isLoading) return <LoadingBlock />
  if (error || !r) return <ErrorAlert error={error} />

  const close = (message?: string) => {
    setDialog(null)
    if (message) setDone(message)
  }

  return (
    <div className="flex flex-col gap-5">
      <Link to="/admin/reservas" className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> Reservas
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">Localizador</p>
          <h1 className="font-mono text-2xl font-bold text-asphalt-900">{r.locator}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <StatusBadge status={r.status} rentalStatus={r.rentalStatus} />
            <Pill tone="blue">{CHANNEL_LABEL[r.channel]}</Pill>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink to={r.voucherPath} variant="secondary"><Ticket className="h-4 w-4" /> Voucher</ButtonLink>
          {r.actions.pickUp && <Button onClick={() => setDialog('pickup')}><ArrowUpFromLine className="h-4 w-4" /> Registrar entrega</Button>}
          {r.actions.return && <Button onClick={() => setDialog('return')}><ArrowDownToLine className="h-4 w-4" /> Registrar devolución</Button>}
          {r.actions.cancel && <Button variant="danger" onClick={() => setDialog('cancel')}><Ban className="h-4 w-4" /> Cancelar</Button>}
        </div>
      </div>

      {done && <Alert tone="success">{done}</Alert>}

      <div className="grid gap-4 lg:grid-cols-3">
        <Info title="Vehículo">
          <p className="font-semibold">{r.vehicleSnapshot.display_name}</p>
          <p className="text-slate-500">Placa: <span className="font-mono">{r.vehicleSnapshot.plate ?? 'se asigna en la entrega'}</span></p>
        </Info>
        <Info title="Recogida">
          <p className="font-semibold">{formatDateTime(r.pickupAt)}</p>
          <p className="text-slate-500">{r.pickupDepot.name}</p>
        </Info>
        <Info title="Devolución">
          <p className="font-semibold">{formatDateTime(r.dropoffAt)}</p>
          <p className="text-slate-500">{r.dropoffDepot.name}</p>
        </Info>
        <Info title="Conductor">
          <p className="font-semibold">{r.driverFirstName} {r.driverLastName} · {r.driverAge} años</p>
          <p className="text-slate-500">{r.driverEmail}{r.driverPhone ? ` · ${r.driverPhone}` : ''}</p>
        </Info>
        <Info title="Pago">
          <p className="font-semibold">{formatMoney(r.totalPrice, r.currency)}</p>
          {cardOf(r.paymentReference) && <p className="text-slate-500">Pagado con {cardOf(r.paymentReference)}</p>}
          <p className="text-slate-500">Referencia: <span className="font-mono">{r.paymentReference}</span></p>
          {r.cancellationFee !== null && <p className="text-slate-500">Penalidad de cancelación: {formatMoney(r.cancellationFee, r.currency)}</p>}
        </Info>
        <Info title="Desglose">
          <ul className="flex flex-col gap-0.5 text-slate-600">
            {r.priceBreakdown.lines.map((l) => (
              <li key={l.code} className="flex justify-between gap-2"><span>{l.description} × {l.quantity}</span><span>{formatMoney(l.amount, r.currency)}</span></li>
            ))}
            <li className="flex justify-between gap-2"><span>IVA</span><span>{formatMoney(r.priceBreakdown.tax, r.currency)}</span></li>
          </ul>
        </Info>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-semibold text-asphalt-900">Inspección del vehículo</h2>
        <InspectionsSummary inspections={r.inspections} currency={r.currency} electric={isElectric(r)} />
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 font-semibold text-asphalt-900">Comprobantes electrónicos</h2>
        <InvoiceList invoices={r.invoices} basePath="/api/admin/invoices" />
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-semibold text-asphalt-900">Historial</h2>
        <ol className="flex flex-col gap-3 border-l-2 border-stone-100 pl-4">
          {r.history.map((h) => (
            <li key={h.id} className="relative text-sm">
              <span className="absolute -left-[1.4rem] top-1 h-2.5 w-2.5 rounded-full bg-brand-500" />
              <p className="font-medium text-slate-800">{ACTION_LABEL[h.action] ?? h.action}</p>
              <p className="text-slate-500">{formatDateTime(h.createdAt)} · {actorLabel(h.actorSub)}</p>
            </li>
          ))}
        </ol>
      </div>

      {dialog === 'pickup' && <PickupDialog reservation={r} onClose={close} />}
      {dialog === 'return' && <ReturnDialog reservation={r} onClose={close} />}
      {dialog === 'cancel' && <CancelDialog reservation={r} onClose={close} />}
    </div>
  )
}

/** Las referencias de la pasarela simulada llevan la marca y los últimos 4 dígitos: PAY-VISA-4242-… */
function cardOf(reference: string): string | null {
  const match = /^PAY-([A-Z]+)-(\d{4})-/.exec(reference)
  return match ? describeCard({ brand: match[1].toLowerCase(), last4: match[2] }) : null
}

function Info({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 text-sm shadow-sm">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      {children}
    </div>
  )
}

type DialogProps = { reservation: AdminReservation; onClose: (message?: string) => void }

/** El snapshot de la reserva guarda el tipo de motor del modelo. */
const isElectric = (r: AdminReservation) => (r.vehicleSnapshot as { fuel_type?: string }).fuel_type === 'ELECTRIC'

function PickupDialog({ reservation, onClose }: DialogProps) {
  const [unitId, setUnitId] = useState(reservation.freeUnits[0]?.id ?? '')
  const unit = reservation.freeUnits.find((u) => u.id === unitId)
  const [fuel, setFuel] = useState(8)
  const [mileage, setMileage] = useState('')
  const [damages, setDamages] = useState<Damage[]>([])
  const [notes, setNotes] = useState('')
  const pickUp = useAdminMutation<Record<string, unknown>, AdminReservation>('POST', `reservations/${reservation.id}/pickup`)

  const submit = () => pickUp.mutate(
    { fleetUnitId: unitId, fuelEighths: fuel, mileage: mileage ? Number(mileage) : undefined, damages: completeDamages(damages), notes: notes || undefined },
    { onSuccess: () => onClose(`Entregado: placa ${unit?.plate}.`) },
  )

  return (
    <Modal title="Registrar entrega" onClose={() => onClose()} wide>
      {reservation.freeUnits.length === 0 ? (
        <Alert tone="error">No hay unidades libres de este modelo en la agencia para todo el periodo. Revisa la flota o los bloqueos.</Alert>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Unidad a entregar" htmlFor="unit">
              <select id="unit" className={INPUT_CLASS} value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                {reservation.freeUnits.map((u) => (
                  <option key={u.id} value={u.id}>{u.plate} · {u.year}{u.color ? ` · ${u.color}` : ''} · {u.mileage.toLocaleString('es-EC')} km</option>
                ))}
              </select>
            </Field>
            <Field label="Kilometraje de salida" htmlFor="km-out" hint={`Registrado: ${unit?.mileage.toLocaleString('es-EC') ?? '—'} km`}>
              <input id="km-out" type="number" min={unit?.mileage ?? 0} className={INPUT_CLASS} placeholder={String(unit?.mileage ?? '')} value={mileage} onChange={(e) => setMileage(e.target.value)} />
            </Field>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">{isElectric(reservation) ? 'Batería al entregar' : 'Combustible al entregar'}</p>
            <FuelGauge value={fuel} onChange={setFuel} electric={isElectric(reservation)} />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">Daños previos (no se cobran al cliente)</p>
            <DamagesEditor value={damages} onChange={setDamages} withCost={false} />
          </div>
          <Field label="Observaciones (opcional)" htmlFor="pickup-notes">
            <input id="pickup-notes" className={INPUT_CLASS} value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          {pickUp.error && <ErrorAlert error={pickUp.error} />}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onClose()}>Cancelar</Button>
            <Button loading={pickUp.isPending} onClick={submit}>Confirmar entrega</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function ReturnDialog({ reservation, onClose }: DialogProps) {
  const pickup = reservation.inspections.find((i) => i.kind === 'PICKUP')
  const [fuel, setFuel] = useState(pickup?.fuelEighths ?? 8)
  const [mileage, setMileage] = useState('')
  const [cleanliness, setCleanliness] = useState<Cleanliness>('CLEAN')
  const [damages, setDamages] = useState<Damage[]>([])
  const [returnedAt, setReturnedAt] = useState('')
  const [notes, setNotes] = useState('')
  const doReturn = useAdminMutation<Record<string, unknown>, AdminReservation>('POST', `reservations/${reservation.id}/return`)

  const body = {
    fuelEighths: fuel, cleanliness, damages: completeDamages(damages), notes: notes || undefined,
    mileage: mileage ? Number(mileage) : undefined,
    returnedAt: returnedAt ? new Date(returnedAt).toISOString() : undefined,
  }
  // Cargos en vivo (sin registrar nada) mientras el agente llena la inspección.
  const deferred = useDeferredValue(JSON.stringify(body))
  const preview = useQuery({
    queryKey: ['admin', 'return-preview', reservation.id, deferred],
    queryFn: () => apiFetch<ReturnPreview>(`/api/admin/reservations/${reservation.id}/return/preview`, { method: 'POST', body: JSON.parse(deferred) }),
    placeholderData: keepPreviousData,
    retry: false,
    // Tras confirmar la reserva ya está devuelta: no se vuelve a calcular (respondería 409).
    enabled: doReturn.isIdle || doReturn.isError,
  })
  const p = preview.data
  const total = p ? Math.round(p.charges.subtotal * 115) / 100 : 0

  return (
    <Modal title="Registrar devolución" onClose={() => onClose()} wide>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-600">
          Placa <span className="font-mono font-semibold">{reservation.vehicleSnapshot.plate}</span> · se devuelve en {reservation.dropoffDepot.name}
          {p && (p.fuel.grade === 'ELECTRIC'
            ? <> · eléctrico, batería de {p.fuel.batteryKwh?.toLocaleString('es-EC')} kWh ({formatMoney(p.fuel.pricePerGallon, 'USD')}/kWh)</>
            : <> · {FUEL_LABEL[p.fuel.grade]}, tanque de {p.fuel.tankLiters} L ({formatMoney(p.fuel.pricePerGallon, 'USD')}/gal)</>)}.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kilometraje al devolver" htmlFor="km" hint={pickup ? `En la entrega: ${pickup.mileage.toLocaleString('es-EC')} km` : undefined}>
            <input id="km" type="number" min={0} className={INPUT_CLASS} value={mileage} onChange={(e) => setMileage(e.target.value)} />
          </Field>
          <Field label="Hora real de devolución" htmlFor="returned-at" hint="Vacío = ahora">
            <input id="returned-at" type="datetime-local" className={INPUT_CLASS} value={returnedAt} onChange={(e) => setReturnedAt(e.target.value)} />
          </Field>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">{p?.fuel.grade === 'ELECTRIC' ? 'Batería al devolver' : 'Combustible al devolver'}</p>
          <FuelGauge value={fuel} onChange={setFuel} reference={pickup?.fuelEighths ?? null} electric={p?.fuel.grade === 'ELECTRIC'} />
        </div>
        <div>
          <p className="mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">Limpieza</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Limpieza">
            {(Object.keys(CLEAN_LABEL) as Cleanliness[]).map((c) => (
              <button key={c} type="button" role="radio" aria-checked={cleanliness === c} onClick={() => setCleanliness(c)}
                className={`rounded-xl border px-3.5 py-2 text-sm font-semibold transition ${cleanliness === c ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-stone-300 text-slate-600 hover:border-stone-400'}`}>
                {CLEAN_LABEL[c]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">Daños nuevos</p>
          <DamagesEditor value={damages} onChange={setDamages} />
        </div>
        <Field label="Observaciones (opcional)" htmlFor="return-notes">
          <input id="return-notes" className={INPUT_CLASS} value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        <div className="rounded-2xl bg-stone-50 p-4 text-sm" aria-live="polite">
          <p className="mb-2 font-semibold text-asphalt-900">Cargos adicionales {preview.isFetching && <span className="text-xs font-normal text-slate-400">· calculando…</span>}</p>
          {preview.error ? <ErrorAlert error={preview.error} /> : p && (
            p.charges.lines.length ? (
              <>
                {p.charges.lines.map((l) => <p key={l.code} className="flex justify-between gap-3 text-slate-600"><span>{l.description}</span><span>{formatMoney(l.subtotal, reservation.currency)}</span></p>)}
                <p className="mt-2 flex justify-between border-t border-stone-200 pt-2 font-semibold text-asphalt-900">
                  <span>Total con IVA (se factura y cobra a la tarjeta registrada)</span><span>{formatMoney(total, reservation.currency)}</span>
                </p>
              </>
            ) : <p className="font-semibold text-emerald-700">Sin cargos: el vehículo vuelve en perfecto estado.</p>
          )}
          {p?.charges.notes.map((n) => <p key={n} className="mt-1 text-xs text-slate-500">{n}</p>)}
          {p?.charges.hasSevereDamage && <p className="mt-1 text-xs font-semibold text-amber-700">Daño grave: la unidad pasará a taller.</p>}
          {p?.maintenanceDue && <p className="mt-1 text-xs font-semibold text-amber-700">Llegó a {p.nextMaintenanceKm.toLocaleString('es-EC')} km: la unidad pasará a mantenimiento preventivo.</p>}
        </div>

        {doReturn.error && <ErrorAlert error={doReturn.error} />}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onClose()}>Cancelar</Button>
          <Button loading={doReturn.isPending} onClick={() => doReturn.mutate(body, {
            onSuccess: () => onClose(p?.charges.lines.length ? `Devolución registrada con cargos por ${formatMoney(total, reservation.currency)} (factura emitida).` : 'Devolución registrada sin cargos.'),
          })}>
            Confirmar devolución
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function CancelDialog({ reservation, onClose }: DialogProps) {
  const cancel = useAdminMutation<void>('POST', `reservations/${reservation.id}/cancel`)
  return (
    <Modal title="Cancelar reserva" onClose={() => onClose()}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-600">
          Se cancelará la reserva <span className="font-mono font-semibold">{reservation.locator}</span> aplicando la política de cancelación.
          {reservation.channel === 'BOOKING_HUB' && ' El Booking Hub recibirá el evento CAR_ORDER_CANCELLED.'}
        </p>
        {cancel.error && <ErrorAlert error={cancel.error} />}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onClose()}>Volver</Button>
          <Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate(undefined, { onSuccess: () => onClose('Reserva cancelada.') })}>
            Cancelar reserva
          </Button>
        </div>
      </div>
    </Modal>
  )
}
