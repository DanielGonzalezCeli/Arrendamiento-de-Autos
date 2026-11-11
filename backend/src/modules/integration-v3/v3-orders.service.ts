import { Injectable, Logger } from '@nestjs/common';
import { randomInt } from 'crypto';
import { translateToV3, v3Error, V3Code } from '../../common/problem-details/problem-details-v3';
import { DomainError } from '../../domain/domain-error';
import { OrderStatus } from '../../domain/enums';
import { BOOKING_PARTNER_SUB } from '../../domain/partners';
import { zonedToUtc } from '../../domain/zoned-time';
import { ClientsClient, isValidIdentification, normalizeIdentification } from '../clients/clients.client';
import { FleetStatusService, vehicleIdForPlate } from '../fleet-status/fleet-status.service';
import { IdempotencyService, IdempotentResult } from '../idempotency/idempotency.service';
import { isUuid } from '../orders/uuid';
import { Reservation } from '../orders/entities/reservation.entity';
import { cancellationOutcome, ReservationService } from '../orders/reservation.service';
import { FleetEventsService } from '../fleet-events/fleet-events.service';
import { CreateOrderRequest, parseCancel, parseCreateOrder, splitFullName } from './v3-request';
import { toCancelResponse, toOrderResponse } from './v3-mapper';

/** Dueño (owner_sub) de las reservas de Booking; vive en el dominio porque también lo usa la entrega (check-in). */
export { BOOKING_PARTNER_SUB };

const PNR_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** PNR de 8 caracteres como el del contrato ("CAR7849B"): CAR + 5 sin caracteres ambiguos. */
export function generatePnr(): string {
  let suffix = '';
  for (let i = 0; i < 5; i++) suffix += PNR_ALPHABET[randomInt(PNR_ALPHABET.length)];
  return `CAR${suffix}`;
}

/** Errores del dominio → semántica v3, dentro de la operación idempotente (así un reintento recibe el mismo código). */
function asV3(error: unknown): unknown {
  if (!(error instanceof DomainError)) return error;
  const t = translateToV3(error);
  return v3Error(t.status, t.code as V3Code, t.title, t.detail, t.invalidParams);
}

/** Órdenes de Booking (contrato v3): reserva de un auto concreto, consulta y cancelación (Saga). */
@Injectable()
export class V3OrdersService {
  private readonly logger = new Logger(V3OrdersService.name);

  constructor(
    private readonly reservations: ReservationService,
    private readonly fleet: FleetStatusService,
    private readonly idempotency: IdempotencyService,
    private readonly fleetEvents: FleetEventsService,
    private readonly clients: ClientsClient,
  ) {}

  /** apiKey: la X-API-Key de Booking, que se reenvía a ms-clientes para vincular la reserva con su cliente. */
  async create(body: unknown, idempotencyKey: string | undefined, correlationId: string, apiKey?: string): Promise<IdempotentResult<unknown>> {
    if (!idempotencyKey || !isUuid(idempotencyKey)) {
      throw v3Error(400, V3Code.MalformedRequest, 'Falta Idempotency-Key', 'La cabecera Idempotency-Key (UUID v4) es obligatoria',
        [{ name: 'Idempotency-Key', reason: 'UUID obligatorio' }]);
    }
    const request = parseCreateOrder(body);
    const unit = await this.fleet.findByVehicleId(request.vehicleId);
    if (!unit) {
      throw v3Error(409, V3Code.VehicleUnavailable, 'Vehículo no disponible', `El vehículo ${request.vehicleId} no existe en la flota de esta tienda`);
    }
    const pickupAt = zonedToUtc(request.pickupDate, request.pickupTime, unit.depot.timezone);
    const dropoffAt = zonedToUtc(request.dropoffDate, request.dropoffTime, unit.depot.timezone);
    if (!pickupAt || !dropoffAt) {
      throw v3Error(422, V3Code.InvalidDates, 'Fechas inválidas', 'Las fechas deben tener el formato YYYY-MM-DD y existir en el calendario', [
        ...(!pickupAt ? [{ name: 'pickup_date', reason: 'fecha inválida' }] : []),
        ...(!dropoffAt ? [{ name: 'dropoff_date', reason: 'fecha inválida' }] : []),
      ]);
    }

    const result = await this.idempotency.execute(
      { ownerSub: BOOKING_PARTNER_SUB, key: idempotencyKey, operation: 'v3.orders.create', fingerprint: request, successStatus: 201 },
      async (manager) => {
        try {
          const locator = generatePnr();
          const reservation = await this.reservations.createForUnit({
            fleetUnitId: unit.unitId,
            pickupAt,
            dropoffAt,
            driver: { ...splitFullName(request.driver.fullName), email: request.driver.email, phone: request.driver.phone, age: request.driver.age },
            extraCodes: request.coverage === 'TOTAL' ? ['CDW'] : [],
            ownerSub: BOOKING_PARTNER_SUB,
            locator,
            paymentReference: `BOOKING-${locator}`,
            partnerData: {
              coverage_type: request.coverage,
              driver_full_name: request.driver.fullName,
              license_number: request.driver.licenseNumber,
              country_license: request.driver.countryLicense,
              flight_number: request.driver.flightNumber,
              requested_pickup_location: request.pickupLocation,
              requested_dropoff_location: request.dropoffLocation,
              correlation_id: correlationId,
              idempotency_key: idempotencyKey,
            },
          }, manager);
          reservation.clientId = await this.resolveClient(request, apiKey ?? '', correlationId);
          await manager.update(Reservation, reservation.id, { clientId: reservation.clientId });
          return toOrderResponse(reservation);
        } catch (error) {
          throw asV3(error);
        }
      },
    );
    if (!result.replayed) {
      this.logger.log(`Reserva v3 ${(result.body as { pnr: string }).pnr} → ${unit.vehicleId} cid=${correlationId}`);
      void this.fleetEvents.vehicleChanged(unit.vehicleId, correlationId);
    }
    return result;
  }

  /**
   * Contrato v3.1: la reserva queda ligada a un cliente único de ms-clientes. Si Booking manda un client_id
   * existente se usa; si no, se busca o registra por identificación (o la licencia) y correo. Ni una
   * identificación con formato inválido ni una caída de ms-clientes impiden reservar: se omite el vínculo.
   */
  private async resolveClient(request: CreateOrderRequest, apiKey: string, correlationId: string): Promise<string | null> {
    const credential = { apiKey };
    if (request.clientId && isUuid(request.clientId)) {
      const known = await this.clients.findById(request.clientId, credential, correlationId);
      if (known) return known.client_id;
    }
    const identification = normalizeIdentification(request.driver.identification ?? request.driver.licenseNumber);
    if (!isValidIdentification(identification)) return null;
    const client = await this.clients.findOrCreate({
      fullName: request.driver.fullName, email: request.driver.email, identification,
      phone: request.driver.phone, licenseNumber: request.driver.licenseNumber, source: 'BOOKING',
    }, credential, correlationId);
    return client?.client_id ?? null;
  }

  async get(idOrPnr: string) {
    const reservation = await this.find(idOrPnr);
    return toOrderResponse(reservation, reservation.status === OrderStatus.Cancelled ? cancellationOutcome(reservation) : undefined);
  }

  async list() {
    const reservations = await this.reservations.listForPartner(BOOKING_PARTNER_SUB);
    return reservations.map((r) => toOrderResponse(r, r.status === OrderStatus.Cancelled ? cancellationOutcome(r) : undefined));
  }

  /**
   * Compensación de la Saga (o cancelación del cliente). Es idempotente por naturaleza: cancelar una orden ya
   * cancelada devuelve 200 con el mismo reembolso, así un reintento de Booking nunca falla.
   */
  async cancel(idOrPnr: string, body: unknown, correlationId: string) {
    const request = parseCancel(body);
    const existing = await this.find(idOrPnr);
    if (existing.status === OrderStatus.Cancelled) return toCancelResponse(cancellationOutcome(existing));

    let outcome;
    try {
      outcome = await this.reservations.cancelForPartner(existing.id, BOOKING_PARTNER_SUB, request.requester !== 'CLIENTE');
    } catch (error) {
      throw asV3(error);
    }
    this.logger.log(`Cancelación v3 ${existing.locator} (${request.requester}) reembolso ${outcome.refundPercentage}% cid=${correlationId}`);
    const plate = outcome.reservation.vehicleSnapshot?.plate;
    if (typeof plate === 'string') void this.fleetEvents.vehicleChanged(vehicleIdForPlate(plate), correlationId);
    return toCancelResponse(outcome);
  }

  private async find(idOrPnr: string) {
    try {
      return await this.reservations.findForPartner(idOrPnr, BOOKING_PARTNER_SUB);
    } catch (error) {
      throw asV3(error);
    }
  }
}
