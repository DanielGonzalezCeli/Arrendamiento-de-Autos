import { ArrowLeft, MapPin, PartyPopper, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { CarIllustration } from '../../components/CarIllustration'
import { Alert, ErrorAlert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Card, PageContainer } from '../../components/ui/Card'
import { LoadingBlock } from '../../components/ui/Spinner'
import { formatDateTime, formatMoney, TRANSMISSION_LABEL } from '../../lib/format'
import type { Reservation, RouteEndpoint } from '../../lib/types'
import { useExtras } from '../catalog/queries'
import { ExtrasSelector } from '../checkout/ExtrasSelector'
import { PriceSummary } from '../checkout/PriceSummary'
import { useCancelReservation, useModifyExtras, useMyReservation } from './reservations-api'
import { StatusBadge } from './StatusBadge'

/** Detalle de una reserva propia (también es la página de confirmación tras el checkout). */
export function ReservationDetailPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const reservation = useMyReservation(id)

  if (reservation.isLoading) return <LoadingBlock />
  if (reservation.isError) return <PageContainer><ErrorAlert error={reservation.error} /></PageContainer>
  const r = reservation.data!

  return (
    <PageContainer>
      <Link to="/mis-reservas" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> Mis reservas
      </Link>

      {params.get('nueva') && r.status === 'CONFIRMED' && (
        <div className="mb-6 flex items-center gap-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 p-6 text-white shadow">
          <PartyPopper className="h-10 w-10 shrink-0" />
          <div>
            <p className="text-lg font-bold">¡Reserva confirmada!</p>
            <p className="text-emerald-50">Tu localizador es <strong className="font-mono">{r.locator}</strong>. Preséntalo en la agencia con tu licencia.</p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-6">
          <Card className="overflow-hidden">
            <div className="flex flex-col sm:flex-row">
              <div className="h-40 sm:h-auto sm:w-64"><CarIllustration category={r.vehicle.category.code} alt={r.vehicle.display_name} /></div>
              <div className="flex-1 p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-lg font-bold text-slate-900">{r.locator}</span>
                  <StatusBadge status={r.status} rentalStatus={r.rentalStatus} />
                </div>
                <h1 className="mt-1 text-xl font-bold text-slate-900">{r.vehicle.display_name}</h1>
                <p className="text-sm text-slate-500">
                  {r.vehicle.category.name} · {TRANSMISSION_LABEL[r.vehicle.transmission]} · {r.vehicle.seats} asientos · {r.vehicle.supplier.name}
                </p>
                {r.vehicle.plate && <p className="mt-1 text-sm text-slate-600">Placa asignada: <strong>{r.vehicle.plate}</strong></p>}
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <RoutePoint title="Recogida" point={r.route.pickup} />
                  <RoutePoint title="Devolución" point={r.route.dropoff} />
                </div>
                <p className="mt-4 text-sm text-slate-500">
                  Conductor: {r.driver.firstName} {r.driver.lastName} · {r.driver.email}
                </p>
              </div>
            </div>
          </Card>

          {r.canModify && <ModifyExtras reservation={r} />}
        </div>

        <div className="flex flex-col gap-4">
          <Card className="p-6">
            <h2 className="mb-4 font-semibold text-slate-800">Precio</h2>
            <PriceSummary price={r.price} />
          </Card>
          {r.status === 'CANCELLED' ? (
            <Alert tone="info">
              Cancelada el {formatDateTime(r.cancelledAt!)}.{' '}
              {r.cancellationFee ? `Penalización: ${formatMoney(r.cancellationFee, r.currency)}.` : 'Sin penalización.'}
            </Alert>
          ) : (
            r.canCancel && <CancelBox reservation={r} />
          )}
        </div>
      </div>
    </PageContainer>
  )
}

function RoutePoint({ title, point }: { title: string; point: RouteEndpoint }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <p className="text-sm font-medium text-slate-800">{formatDateTime(point.datetime)}</p>
      <p className="flex items-start gap-1 text-sm text-slate-600"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />{point.name}</p>
    </div>
  )
}

function ModifyExtras({ reservation }: { reservation: Reservation }) {
  const extras = useExtras()
  const modify = useModifyExtras(reservation.id)
  const current = new Set(reservation.extras.map((e) => e.code))
  const [selected, setSelected] = useState<Set<string>>(current)
  const [saved, setSaved] = useState(false)

  // Si la reserva cambia (tras guardar), se resincroniza la selección.
  useEffect(() => setSelected(new Set(reservation.extras.map((e) => e.code))), [reservation.extras])

  const toAdd = [...selected].filter((c) => !current.has(c))
  const toRemove = [...current].filter((c) => !selected.has(c))
  const toggle = (code: string) => {
    setSaved(false)
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  return (
    <Card className="p-6">
      <h2 className="mb-1 font-semibold text-slate-800">Modificar extras</h2>
      <p className="mb-4 text-sm text-slate-500">El precio se recalcula con las tarifas vigentes al guardar.</p>
      {extras.data ? <ExtrasSelector extras={extras.data} selected={selected} onToggle={toggle} disabled={modify.isPending} /> : <LoadingBlock />}
      {modify.isError && <div className="mt-4"><ErrorAlert error={modify.error} /></div>}
      {saved && <div className="mt-4"><Alert tone="success">Cambios guardados. Nuevo total: {formatMoney(reservation.totalPrice, reservation.currency)}.</Alert></div>}
      <Button
        className="mt-4"
        disabled={toAdd.length === 0 && toRemove.length === 0}
        loading={modify.isPending}
        onClick={() => modify.mutate({ extrasToAdd: toAdd, extrasToRemove: toRemove }, { onSuccess: () => setSaved(true) })}
      >
        Guardar cambios
      </Button>
    </Card>
  )
}

function CancelBox({ reservation }: { reservation: Reservation }) {
  const cancel = useCancelReservation(reservation.id)
  const [confirming, setConfirming] = useState(false)
  const hoursLeft = (Date.parse(reservation.pickupAt) - Date.now()) / 3_600_000

  return (
    <Card className="p-6">
      <h2 className="mb-1 font-semibold text-slate-800">Cancelar reserva</h2>
      <p className="mb-4 text-sm text-slate-500">
        {hoursLeft >= 24 ? 'Aún puedes cancelar sin costo.' : 'Faltan menos de 24 h: se cobrará un día de tarifa.'}
      </p>
      {cancel.isError && <div className="mb-3"><ErrorAlert error={cancel.error} /></div>}
      {confirming ? (
        <div className="flex gap-2">
          <Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate(undefined)}>Sí, cancelar</Button>
          <Button variant="secondary" onClick={() => setConfirming(false)}>No</Button>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => setConfirming(true)}><XCircle className="h-4 w-4" /> Cancelar reserva</Button>
      )}
    </Card>
  )
}
