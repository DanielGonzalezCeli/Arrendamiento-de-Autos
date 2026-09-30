import { ArrowDownToLine, ArrowLeft, ArrowUpFromLine, Ban } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Alert, ErrorAlert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Field, INPUT_CLASS } from '../../components/ui/Field'
import { LoadingBlock } from '../../components/ui/Spinner'
import { formatDateTime, formatMoney } from '../../lib/format'
import { StatusBadge } from '../reservations/StatusBadge'
import { CHANNEL_LABEL, useAdminMutation, useAdminQuery, type AdminReservation } from './admin-api'
import { Modal, Pill } from './components'

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
          <h1 className="font-mono text-2xl font-bold text-slate-900">{r.locator}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <StatusBadge status={r.status} rentalStatus={r.rentalStatus} />
            <Pill tone="blue">{CHANNEL_LABEL[r.channel]}</Pill>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
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

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-semibold text-slate-900">Historial</h2>
        <ol className="flex flex-col gap-3 border-l-2 border-slate-100 pl-4">
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

function Info({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      {children}
    </div>
  )
}

type DialogProps = { reservation: AdminReservation; onClose: (message?: string) => void }

function PickupDialog({ reservation, onClose }: DialogProps) {
  const [unitId, setUnitId] = useState(reservation.freeUnits[0]?.id ?? '')
  const pickUp = useAdminMutation<{ fleetUnitId: string }, AdminReservation>('POST', `reservations/${reservation.id}/pickup`)
  const plate = reservation.freeUnits.find((u) => u.id === unitId)?.plate

  return (
    <Modal title="Registrar entrega" onClose={() => onClose()}>
      {reservation.freeUnits.length === 0 ? (
        <Alert tone="error">No hay unidades libres de este modelo en la agencia para todo el periodo. Revisa la flota o los bloqueos.</Alert>
      ) : (
        <div className="flex flex-col gap-4">
          <Field label="Unidad a entregar" htmlFor="unit">
            <select id="unit" className={INPUT_CLASS} value={unitId} onChange={(e) => setUnitId(e.target.value)}>
              {reservation.freeUnits.map((u) => (
                <option key={u.id} value={u.id}>{u.plate} · {u.year}{u.color ? ` · ${u.color}` : ''} · {u.mileage.toLocaleString('es-EC')} km</option>
              ))}
            </select>
          </Field>
          {pickUp.error && <ErrorAlert error={pickUp.error} />}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onClose()}>Cancelar</Button>
            <Button loading={pickUp.isPending} onClick={() => pickUp.mutate({ fleetUnitId: unitId }, { onSuccess: () => onClose(`Entregado: placa ${plate}.`) })}>
              Confirmar entrega
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function ReturnDialog({ reservation, onClose }: DialogProps) {
  const [mileage, setMileage] = useState('')
  const [invalid, setInvalid] = useState<string>()
  const doReturn = useAdminMutation<{ mileage?: number }, AdminReservation>('POST', `reservations/${reservation.id}/return`)

  function submit() {
    const km = mileage.trim() === '' ? undefined : Number(mileage)
    if (km !== undefined && (!Number.isInteger(km) || km < 0 || km > 2_000_000)) {
      setInvalid('Kilometraje entero entre 0 y 2.000.000')
      return
    }
    setInvalid(undefined)
    doReturn.mutate({ mileage: km }, { onSuccess: () => onClose('Devolución registrada. La unidad queda en la agencia de devolución.') })
  }

  return (
    <Modal title="Registrar devolución" onClose={() => onClose()}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-600">
          Placa <span className="font-mono font-semibold">{reservation.vehicleSnapshot.plate}</span> · se devuelve en {reservation.dropoffDepot.name}.
        </p>
        <Field label="Kilometraje al devolver (opcional)" htmlFor="km" error={invalid ?? undefined} hint="No puede ser menor al registrado en la entrega.">
          <input id="km" type="number" min={0} className={INPUT_CLASS} value={mileage} onChange={(e) => setMileage(e.target.value)} aria-invalid={invalid ? true : undefined} />
        </Field>
        {doReturn.error && <ErrorAlert error={doReturn.error} />}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onClose()}>Cancelar</Button>
          <Button loading={doReturn.isPending} onClick={submit}>Confirmar devolución</Button>
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
