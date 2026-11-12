import { OrderStatus, RentalStatus } from '../../../domain/enums';
import { describePaymentReference } from '../../../domain/payment-simulator';
import { Reservation } from '../../orders/entities/reservation.entity';
import { cancellationOutcome } from '../../orders/reservation.service';
import { refundIdFor } from '../../integration-v3/v3-mapper';

/** Vista de una reserva para el marketplace y el panel (API interna). */
export function toReservationView(r: Reservation, voucherPath: string | null = null, now = new Date()) {
  const notStarted = r.status === OrderStatus.Confirmed && r.rentalStatus === RentalStatus.NotStarted && now < r.pickupAt;
  return {
    id: r.id,
    locator: r.locator,
    status: r.status,
    rentalStatus: r.rentalStatus,
    channel: r.channel,
    createdAt: r.createdAt,
    pickupAt: r.pickupAt,
    dropoffAt: r.dropoffAt,
    vehicle: r.vehicleSnapshot,
    route: r.routeSnapshot,
    price: r.priceBreakdown,
    totalPrice: r.totalPrice,
    currency: r.currency,
    payment: { reference: r.paymentReference, card: describePaymentReference(r.paymentReference) },
    extras: (r.extras ?? []).map((e) => ({ code: e.code, name: e.name, subtotal: e.subtotal })),
    driver: { firstName: r.driverFirstName, lastName: r.driverLastName, email: r.driverEmail, phone: r.driverPhone },
    cancelledAt: r.cancelledAt,
    cancellationFee: r.cancellationFee,
    /** Reembolso de una reserva cancelada (mismo REF-AUTO que ve Booking); null si sigue activa. */
    refund: r.status === OrderStatus.Cancelled ? refundView(r) : null,
    canModify: notStarted,
    canCancel: notStarted,
    /** Ruta del voucher en el frontend (link firmado); null si no se pidió. */
    voucherPath,
  };
}

function refundView(r: Reservation) {
  const { refundAmount, refundPercentage } = cancellationOutcome(r);
  return { refundId: refundIdFor(r.locator), amount: refundAmount, percentage: refundPercentage, currency: r.currency };
}
