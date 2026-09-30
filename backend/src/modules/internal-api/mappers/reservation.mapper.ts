import { OrderStatus, RentalStatus } from '../../../domain/enums';
import { Reservation } from '../../orders/entities/reservation.entity';

/** Vista de una reserva para el marketplace y el panel (API interna). */
export function toReservationView(r: Reservation, now = new Date()) {
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
    extras: (r.extras ?? []).map((e) => ({ code: e.code, name: e.name, subtotal: e.subtotal })),
    driver: { firstName: r.driverFirstName, lastName: r.driverLastName, email: r.driverEmail, phone: r.driverPhone },
    cancelledAt: r.cancelledAt,
    cancellationFee: r.cancellationFee,
    canModify: notStarted,
    canCancel: notStarted,
  };
}
