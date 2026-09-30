import { OrderStatus, RentalStatus } from '../../../domain/enums';
import { Hold } from '../../orders/entities/hold.entity';
import { OrderPreview } from '../../orders/entities/order-preview.entity';
import { Reservation } from '../../orders/entities/reservation.entity';

/** Adaptadores de órdenes → schemas del contrato. */

/** OrderHoldResponse. Si no hay stock se responde 409 (no un 200 con status FAILED). */
export function toOrderHoldResponse(hold: Hold) {
  return { hold_id: hold.id, expires_at: hold.expiresAt.toISOString(), status: 'HELD' as const };
}

/** OrderPreviewResponse */
export function toOrderPreviewResponse(requestId: string, preview: OrderPreview) {
  return {
    request_id: requestId,
    data: {
      order_preview_id: preview.id,
      total_price: preview.totalPrice,
      currency: preview.currency,
      breakdown: preview.breakdown,
    },
  };
}

/**
 * OrderDetail. vehicle_details y route_details son los snapshots históricos (RN20).
 * _links (HATEOAS): acciones disponibles según el estado — modify/cancel solo si aún se puede.
 */
export function toOrderDetail(reservation: Reservation, baseUrl: string) {
  const self = `${baseUrl}/autos/v1/orders/${reservation.id}`;
  const actionable = reservation.status === OrderStatus.Confirmed && reservation.rentalStatus === RentalStatus.NotStarted;
  return {
    order_id: reservation.id,
    locator: reservation.locator,
    status: reservation.status,
    vehicle_details: reservation.vehicleSnapshot,
    route_details: reservation.routeSnapshot,
    total_price: reservation.totalPrice,
    currency: reservation.currency,
    creation_date: reservation.createdAt.toISOString(),
    _links: {
      self,
      ...(actionable ? { modify: `${self}/modify`, cancel: `${self}/cancel` } : {}),
    },
  };
}
