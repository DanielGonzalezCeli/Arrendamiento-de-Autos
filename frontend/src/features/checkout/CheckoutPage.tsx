import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, Lock } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CarIllustration } from '../../components/CarIllustration'
import { Alert, ErrorAlert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Card, PageContainer } from '../../components/ui/Card'
import { Field, Input } from '../../components/ui/Field'
import { LoadingBlock } from '../../components/ui/Spinner'
import { ApiError } from '../../lib/api'
import { formatDateTime } from '../../lib/format'
import type { Offer } from '../../lib/types'
import { useAuth } from '../auth/AuthContext'
import { readLastSearch, useExtras } from '../catalog/queries'
import { criteriaToParams } from '../search/search-criteria'
import { confirmReservation, createHold, createPreview, type DriverInput } from './checkout-api'
import { ExtrasSelector } from './ExtrasSelector'
import { HoldCountdown } from './HoldCountdown'
import { PriceSummary } from './PriceSummary'

/**
 * Checkout: hold (15 min) → extras con precio en vivo (preview) → datos del conductor → confirmación.
 * Cada paso llama al backend; el frontend no calcula precios ni disponibilidad.
 */
export function CheckoutPage() {
  const { vehicleId } = useParams()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const last = readLastSearch()
  const offer = last?.result.searchToken === token ? last.result.offers.find((o) => o.vehicle.id === vehicleId) : undefined

  if (!offer || !vehicleId) {
    return (
      <PageContainer title="Reserva">
        <Alert tone="info">
          La búsqueda expiró o no corresponde a este vehículo. <Link to="/" className="font-semibold underline">Busca de nuevo</Link>.
        </Alert>
      </PageContainer>
    )
  }
  return (
    <Checkout vehicleId={vehicleId} token={token} offer={offer} pickupAt={last!.result.pickupAt} dropoffAt={last!.result.dropoffAt}
      backUrl={`/buscar?${criteriaToParams(last!.criteria)}`} />
  )
}

interface CheckoutProps {
  vehicleId: string
  token: string
  offer: Offer
  pickupAt: string
  dropoffAt: string
  backUrl: string
}

function Checkout({ vehicleId, token, offer, pickupAt, dropoffAt, backUrl }: CheckoutProps) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const extras = useExtras()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [holdExpired, setHoldExpired] = useState(false)
  const [driver, setDriver] = useState<DriverInput>({
    firstName: user?.firstName ?? '', lastName: user?.lastName ?? '', email: user?.email ?? '', phone: user?.phone ?? '',
  })
  // Una clave por intento de compra: reintentos y doble clic reciben la misma reserva.
  const [idempotencyKey] = useState(() => crypto.randomUUID())

  // 1. Hold al entrar (repetirlo devuelve el mismo hold vigente: es seguro con StrictMode).
  const hold = useQuery({
    queryKey: ['hold', token, vehicleId],
    queryFn: () => createHold(token, vehicleId),
    retry: false,
    staleTime: Infinity,
  })

  // 2. Preview cada vez que cambian los extras.
  const extraCodes = useMemo(() => [...selected].sort(), [selected])
  const preview = useQuery({
    queryKey: ['preview', token, vehicleId, hold.data?.holdId, extraCodes],
    queryFn: () => createPreview({ searchToken: token, vehicleId, holdId: hold.data!.holdId, extras: extraCodes }),
    enabled: !!hold.data && !holdExpired,
    placeholderData: keepPreviousData,
    retry: false,
  })

  // 3. Confirmación.
  const confirm = useMutation({
    mutationFn: () => confirmReservation(preview.data!.orderPreviewId, { ...driver, phone: driver.phone?.trim() || undefined }, idempotencyKey),
    onSuccess: (reservation) => {
      queryClient.invalidateQueries({ queryKey: ['my-reservations'] })
      navigate(`/mis-reservas/${reservation.id}?nueva=1`, { replace: true })
    },
  })

  const onExpire = useCallback(() => setHoldExpired(true), [])
  useEffect(() => setHoldExpired(false), [hold.data?.holdId])

  const toggleExtra = (code: string) => setSelected((current) => {
    const next = new Set(current)
    if (next.has(code)) next.delete(code)
    else next.add(code)
    return next
  })

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    confirm.mutate()
  }

  const fieldError = (name: string) => (confirm.error instanceof ApiError ? confirm.error.fieldError(`driver.${name}`) : undefined)
  const set = (key: keyof DriverInput) => (e: React.ChangeEvent<HTMLInputElement>) => setDriver({ ...driver, [key]: e.target.value })

  if (hold.isLoading) return <LoadingBlock label="Bloqueando el vehículo para ti…" />
  if (hold.isError) {
    return (
      <PageContainer title="Reserva">
        <ErrorAlert error={hold.error} />
        <Link to={backUrl} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-600"><ArrowLeft className="h-4 w-4" /> Elegir otro vehículo</Link>
      </PageContainer>
    )
  }

  return (
    <PageContainer title="Completa tu reserva" subtitle={`${offer.vehicle.displayName} · ${offer.vehicle.supplier.name}`}>
      <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[1fr_380px]" noValidate>
        <div className="flex flex-col gap-6">
          {holdExpired ? (
            <Alert tone="error">
              El bloqueo expiró.{' '}
              <button type="button" className="font-semibold underline" onClick={() => hold.refetch()}>Volver a bloquear el vehículo</button>
            </Alert>
          ) : (
            hold.data && <HoldCountdown expiresAt={hold.data.expiresAt} onExpire={onExpire} />
          )}

          <Card className="p-6">
            <h2 className="mb-1 font-semibold text-slate-800">1. Extras y coberturas</h2>
            <p className="mb-4 text-sm text-slate-500">Opcionales. El total se actualiza al instante.</p>
            {extras.data ? <ExtrasSelector extras={extras.data} selected={selected} onToggle={toggleExtra} disabled={holdExpired} /> : <LoadingBlock />}
          </Card>

          <Card className="p-6">
            <h2 className="mb-4 font-semibold text-slate-800">2. Datos del conductor principal</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre" htmlFor="firstName" error={fieldError('firstName')}>
                <Input id="firstName" value={driver.firstName} onChange={set('firstName')} error={fieldError('firstName')} />
              </Field>
              <Field label="Apellido" htmlFor="lastName" error={fieldError('lastName')}>
                <Input id="lastName" value={driver.lastName} onChange={set('lastName')} error={fieldError('lastName')} />
              </Field>
              <Field label="Correo" htmlFor="email" error={fieldError('email')}>
                <Input id="email" type="email" value={driver.email} onChange={set('email')} error={fieldError('email')} />
              </Field>
              <Field label="Teléfono" htmlFor="phone">
                <Input id="phone" type="tel" value={driver.phone} onChange={set('phone')} />
              </Field>
            </div>
          </Card>
        </div>

        <div>
          <Card className="overflow-hidden lg:sticky lg:top-6">
            <div className="h-36"><CarIllustration category={offer.vehicle.category.code} imageUrl={offer.vehicle.imageUrl} alt={offer.vehicle.displayName} /></div>
            <div className="p-6">
              <h2 className="font-semibold text-slate-800">Resumen</h2>
              <dl className="mt-2 mb-4 space-y-1 text-sm text-slate-600">
                <div><dt className="inline font-medium">Recogida: </dt><dd className="inline">{formatDateTime(pickupAt)} · {offer.pickupDepot.name}</dd></div>
                <div><dt className="inline font-medium">Devolución: </dt><dd className="inline">{formatDateTime(dropoffAt)} · {offer.dropoffDepot.name}</dd></div>
              </dl>
              {preview.isError && <ErrorAlert error={preview.error} />}
              {preview.data ? <PriceSummary price={preview.data.price} updating={preview.isFetching} /> : <PriceSummary price={offer.price} updating />}
              {confirm.isError && <div className="mt-4"><ErrorAlert error={confirm.error} /></div>}
              <Button type="submit" className="mt-5 w-full" loading={confirm.isPending} disabled={!preview.data || preview.isFetching || holdExpired}>
                <Lock className="h-4 w-4" /> Confirmar y pagar
              </Button>
              <p className="mt-2 flex items-center justify-center gap-1 text-center text-xs text-slate-400">
                <CheckCircle2 className="h-3.5 w-3.5" /> Pago simulado (el pago real pertenece a otro sistema del Booking Hub)
              </p>
            </div>
          </Card>
        </div>
      </form>
    </PageContainer>
  )
}
