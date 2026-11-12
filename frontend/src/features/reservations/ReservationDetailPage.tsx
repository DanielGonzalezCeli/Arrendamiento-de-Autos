import { ArrowLeft, CheckCircle2, Download, KeyRound, PartyPopper, Ticket, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { CarIllustration } from '../../components/CarIllustration'
import { DepotCard } from '../../components/DepotCard'
import { Alert, ErrorAlert } from '../../components/ui/Alert'
import { Button, ButtonLink } from '../../components/ui/Button'
import { Card, PageContainer } from '../../components/ui/Card'
import { Modal } from '../../components/ui/Modal'
import { LoadingBlock, Skeleton } from '../../components/ui/Spinner'
import { useQuery } from '@tanstack/react-query'
import { API_BASE_URL, apiFetch } from '../../lib/api'
import { InvoiceList, type InvoiceView } from '../invoices/InvoiceList'
import { formatDateTime, formatMoney, TRANSMISSION_LABEL } from '../../lib/format'
import { describeCard } from '../../lib/payment-card'
import type { Reservation, RouteEndpoint } from '../../lib/types'
import { useExtras, useLocations } from '../catalog/queries'
import { ExtrasSelector } from '../checkout/ExtrasSelector'
import { PriceSummary } from '../checkout/PriceSummary'
import { useCancelReservation, useModifyExtras, useMyReservation } from './reservations-api'
import { StatusBadge } from './StatusBadge'

/** Detalle de una reserva propia (también es la página de confirmación tras el checkout). */
export function ReservationDetailPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const reservation = useMyReservation(id)
  const [justCancelled, setJustCancelled] = useState<Reservation | null>(null)

  if (reservation.isLoading) return <LoadingBlock />
  if (reservation.isError) return <PageContainer><ErrorAlert error={reservation.error} /></PageContainer>
  const r = reservation.data!

  return (
    <PageContainer>
      <Link to="/mis-reservas" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> Mis reservas
      </Link>

      {params.get('nueva') && r.status === 'CONFIRMED' && (
        <div className="topo mb-6 flex animate-pop flex-wrap items-center gap-4 rounded-2xl bg-brand-800 p-6 text-white shadow-lg shadow-brand-900/20">
          <PartyPopper className="h-10 w-10 shrink-0 text-accent-300" />
          <div className="min-w-0 flex-1">
            <p className="font-display text-xl font-bold">¡Reserva confirmada!</p>
            <p className="text-brand-100">Tu localizador es <strong className="font-mono text-accent-300">{r.locator}</strong>. Presenta tu voucher en la agencia con tu licencia.</p>
          </div>
          {r.voucherPath && <ButtonLink to={r.voucherPath} variant="accent"><Ticket className="h-4 w-4" /> Ver mi voucher</ButtonLink>}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-6">
          <Card className="overflow-hidden">
            <div className="flex flex-col sm:flex-row">
              <div className="h-40 sm:h-auto sm:w-64"><CarIllustration category={r.vehicle.category.code} imageUrl={r.vehicle.image_url} alt={r.vehicle.display_name} /></div>
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
            {r.payment && (
              <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
                {r.payment.card ? <>Pagado con <strong className="text-slate-700">{describeCard(r.payment.card)}</strong></> : 'Pago registrado'}
                <span className="block font-mono">Ref. {r.payment.reference}</span>
              </p>
            )}
          </Card>
          {r.voucherPath && r.status !== 'CANCELLED' && <VoucherCard path={r.voucherPath} />}
          <InvoicesCard reservation={r} />
          {r.status === 'CANCELLED' ? (
            <Alert tone="info">
              Cancelada el {formatDateTime(r.cancelledAt!)}.{' '}
              {r.cancellationFee ? `Penalización: ${formatMoney(r.cancellationFee, r.currency)}.` : 'Sin penalización.'}
              {r.refund && (
                <span className="mt-1 block">
                  Reembolso <strong className="font-mono">{r.refund.refundId}</strong>: {formatMoney(r.refund.amount, r.refund.currency)} ({r.refund.percentage} %).
                </span>
              )}
            </Alert>
          ) : r.canCancel ? (
            <CancelBox reservation={r} onCancelled={setJustCancelled} />
          ) : (
            <NotCancellable reservation={r} />
          )}
        </div>
      </div>
      {justCancelled && <CancelledModal reservation={justCancelled} onClose={() => setJustCancelled(null)} />}
    </PageContainer>
  )
}

/** Factura del pago y comprobantes posteriores (ajustes, notas de crédito, cargos de devolución). */
function InvoicesCard({ reservation }: { reservation: Reservation }) {
  // La clave incluye estado y total: tras modificar o cancelar se vuelve a pedir (hay un comprobante nuevo).
  const invoices = useQuery({
    queryKey: ['invoices', reservation.id, reservation.status, reservation.totalPrice],
    queryFn: () => apiFetch<InvoiceView[]>(`/api/me/reservations/${reservation.id}/invoices`),
  })
  return (
    <Card className="p-6">
      <h2 className="mb-1 font-semibold text-asphalt-900">Facturación</h2>
      {invoices.isLoading ? <Skeleton className="h-16" /> : invoices.isError ? <ErrorAlert error={invoices.error} /> : <InvoiceList invoices={invoices.data ?? []} basePath="/api/me/invoices" />}
    </Card>
  )
}

/** Acceso al voucher: el link (con su token) sirve también para compartirlo o abrirlo en el celular. */
function VoucherCard({ path }: { path: string }) {
  const [base, query] = path.split('?')
  return (
    <Card className="p-6">
      <h2 className="flex items-center gap-2 font-semibold text-asphalt-900"><Ticket className="h-4 w-4 text-accent-600" /> Tu voucher</h2>
      <p className="mt-1 text-sm text-slate-500">Con código QR para el mostrador. Puedes abrirlo en el celular o descargarlo.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <ButtonLink to={path} variant="primary">Ver voucher</ButtonLink>
        <a href={`${API_BASE_URL}/api/vouchers/${base.split('/').pop()}/pdf?${query}`}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-stone-50 active:scale-[0.97]">
          <Download className="h-4 w-4" /> PDF
        </a>
      </div>
    </Card>
  )
}

/** El snapshot de la reserva guarda nombre y dirección; teléfono, horario y mapa salen de la agencia actual. */
function RoutePoint({ title, point }: { title: string; point: RouteEndpoint }) {
  const { data: cities } = useLocations()
  const depot = cities?.flatMap((c) => c.depots).find((d) => d.id === point.depot_id)
  return <DepotCard title={title} when={point.datetime} depot={depot ? { ...depot, name: point.name, address: point.address } : point} />
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

/**
 * Cancelación con nuestra regla: gratis hasta 24 h antes de la recogida; después se retiene un día de tarifa. El
 * reembolso sale como nota de crédito (SRI) por lo devuelto, así que el porcentaje mostrado es el real.
 */
function CancelBox({ reservation, onCancelled }: { reservation: Reservation; onCancelled: (r: Reservation) => void }) {
  const cancel = useCancelReservation(reservation.id)
  const [confirming, setConfirming] = useState(false)
  const free = (Date.parse(reservation.pickupAt) - Date.now()) / 3_600_000 >= 24
  const dayRate = reservation.price.lines.find((line) => line.code === 'BASE')?.unit_price ?? 0
  const refund = free ? reservation.totalPrice : Math.max(0, reservation.totalPrice - dayRate)

  return (
    <Card className="p-6">
      <h2 className="mb-1 font-semibold text-slate-800">Cancelar reserva</h2>
      <p className="mb-4 text-sm text-slate-500">
        {free ? 'Aún puedes cancelar sin costo.' : 'Faltan menos de 24 h: se cobrará un día de tarifa.'}
      </p>
      <Button variant="secondary" onClick={() => setConfirming(true)}><XCircle className="h-4 w-4" /> Cancelar reserva</Button>
      {confirming && (
        <Modal title="¿Cancelar esta reserva?" onClose={() => setConfirming(false)} locked={cancel.isPending}>
          <div className="flex flex-col gap-3 text-sm text-slate-600">
            <p>
              Se anulará la reserva <strong className="font-mono text-slate-900">{reservation.locator}</strong> y el{' '}
              {reservation.vehicle.display_name} volverá a estar disponible para otros clientes. Esta acción no se puede deshacer.
            </p>
            <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
              <p>
                Reembolso: <strong className="text-slate-900">{formatMoney(refund, reservation.currency)}</strong>{' '}
                ({free ? '100 %, sin penalización' : `se retiene un día de tarifa, ${formatMoney(dayRate, reservation.currency)}`}).
              </p>
              <p className="mt-1 text-xs text-slate-500">Se emite una nota de crédito electrónica por el valor devuelto.</p>
            </div>
            {cancel.isError && <ErrorAlert error={cancel.error} />}
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <Button variant="secondary" disabled={cancel.isPending} onClick={() => setConfirming(false)}>Volver</Button>
              <Button
                variant="danger"
                loading={cancel.isPending}
                onClick={() => cancel.mutate(undefined, { onSuccess: (cancelled) => { setConfirming(false); onCancelled(cancelled) } })}
              >
                Sí, cancelar
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </Card>
  )
}

/** Confirmación tras cancelar: código de reembolso, monto y auto liberado. */
function CancelledModal({ reservation, onClose }: { reservation: Reservation; onClose: () => void }) {
  const refund = reservation.refund
  return (
    <Modal title="Reserva cancelada" onClose={onClose}>
      <div className="flex flex-col gap-4 text-sm">
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800">
          <CheckCircle2 className="h-6 w-6 shrink-0" />
          <p className="font-semibold">¡Cancelación y reembolso exitosos!</p>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-slate-600">
          {refund && (
            <>
              <dt>Código de reembolso</dt>
              <dd className="font-mono font-semibold text-slate-900">{refund.refundId}</dd>
              <dt>Monto reembolsado</dt>
              <dd className="text-slate-900">{formatMoney(refund.amount, refund.currency)} <span className="text-slate-500">({refund.percentage} %)</span></dd>
            </>
          )}
          <dt>Inventario</dt>
          <dd className="font-medium text-emerald-700">✓ Vehículo liberado a DISPONIBLE</dd>
        </dl>
        <p className="text-xs text-slate-500">La nota de crédito aparece en Facturación.</p>
        <div className="flex justify-end"><Button onClick={onClose}>Entendido</Button></div>
      </div>
    </Modal>
  )
}

/** Reserva activa que ya no admite cancelación: el auto se entregó o ya pasó la hora de recogida. */
function NotCancellable({ reservation }: { reservation: Reservation }) {
  const text = reservation.rentalStatus === 'PICKED_UP'
    ? 'Vehículo entregado / Alquiler en curso (no cancelable).'
    : reservation.rentalStatus === 'RETURNED'
      ? 'Alquiler finalizado: el vehículo ya fue devuelto.'
      : 'Ya pasó la hora de recogida: la reserva no se puede cancelar.'
  return (
    <Alert tone="info">
      <span className="inline-flex items-center gap-1.5 font-medium"><KeyRound className="h-4 w-4" /> {text}</span>
    </Alert>
  )
}
