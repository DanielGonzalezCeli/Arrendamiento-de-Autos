import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { IdempotencyKeyGuard } from '../../common/guards/idempotency-key.guard';
import { publicBaseUrl } from '../../common/public-base-url';
import { RequestId } from '../../common/request-id.decorator';
import { OrderChannel } from '../../domain/enums';
import { IdempotencyService, IdempotentResult } from '../idempotency/idempotency.service';
import {
  AutosScope, CurrentPrincipal, IntegrationAuthGuard, IntegrationPrincipal, RequireScopes,
} from '../integration-auth/integration-auth.guard';
import { HoldService } from '../orders/hold.service';
import { OrderPreviewService } from '../orders/order-preview.service';
import { ModifyReservationInput, ReservationService } from '../orders/reservation.service';
import { OrderCreateRequestDto, OrderHoldRequestDto, OrderModifyRequestDto, OrderPreviewRequestDto } from './dto/order-requests.dto';
import { toOrderDetail, toOrderHoldResponse, toOrderPreviewResponse } from './mappers/order.mapper';

const DRIVER_DETAILS_FIELDS = {
  firstName: 'driver_details.first_name', lastName: 'driver_details.last_name', email: 'driver_details.email',
};

/**
 * API de integración — "Gestión de Órdenes (Reservas)". OAuth2 con el scope que exige cada operación
 * en el contrato; Idempotency-Key en create/modify/cancel. El dueño de cada orden es el `sub` del token.
 */
@ApiExcludeController()
@Controller('orders')
@UseGuards(IntegrationAuthGuard)
export class OrdersController {
  constructor(
    private readonly holds: HoldService,
    private readonly previews: OrderPreviewService,
    private readonly reservations: ReservationService,
    private readonly idempotency: IdempotencyService,
    private readonly config: ConfigService,
  ) {}

  @Post('hold')
  @HttpCode(HttpStatus.OK)
  @RequireScopes(AutosScope.Book)
  async hold(@Body() body: OrderHoldRequestDto, @CurrentPrincipal() principal: IntegrationPrincipal) {
    const hold = await this.holds.create({
      searchToken: body.search_token, vehicleId: body.vehicle_id, ownerSub: principal.sub, driverAge: body.driver?.age,
    });
    return toOrderHoldResponse(hold);
  }

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @RequireScopes(AutosScope.Read)
  async preview(@Body() body: OrderPreviewRequestDto, @CurrentPrincipal() principal: IntegrationPrincipal, @RequestId() requestId: string) {
    const preview = await this.previews.create({
      searchToken: body.search_token, vehicleId: body.vehicle_id, holdId: body.hold_id, extras: body.extras ?? [], ownerSub: principal.sub,
    });
    return toOrderPreviewResponse(requestId, preview);
  }

  @Post('create')
  @RequireScopes(AutosScope.Book)
  @UseGuards(IdempotencyKeyGuard)
  async create(
    @Body() body: OrderCreateRequestDto,
    @Headers('idempotency-key') key: string,
    @CurrentPrincipal() principal: IntegrationPrincipal,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.idempotency.execute(
      { ownerSub: principal.sub, key, operation: 'orders.create', fingerprint: body, successStatus: HttpStatus.CREATED },
      (manager) => this.reservations.create({
        orderPreviewId: body.order_preview_id,
        paymentReference: body.payment_reference,
        driver: {
          firstName: body.driver_details.first_name, lastName: body.driver_details.last_name,
          email: body.driver_details.email, phone: body.driver_details.phone_number,
        },
        driverFields: DRIVER_DETAILS_FIELDS,
        ownerSub: principal.sub,
        channel: OrderChannel.BookingHub,
        affiliateId: principal.affiliateId,
      }, manager).then((reservation) => toOrderDetail(reservation, publicBaseUrl(this.config, req))),
    );
    return respond(res, result);
  }

  @Get(':orderId')
  @RequireScopes(AutosScope.Read)
  async get(@Param('orderId') orderId: string, @CurrentPrincipal() principal: IntegrationPrincipal, @Req() req: Request) {
    const reservation = await this.reservations.getForOwner(orderId, principal.sub);
    return toOrderDetail(reservation, publicBaseUrl(this.config, req));
  }

  @Post(':orderId/modify')
  @RequireScopes(AutosScope.Book)
  @UseGuards(IdempotencyKeyGuard)
  async modify(
    @Param('orderId') orderId: string,
    @Body() body: OrderModifyRequestDto,
    @Headers('idempotency-key') key: string,
    @CurrentPrincipal() principal: IntegrationPrincipal,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.idempotency.execute(
      { ownerSub: principal.sub, key, operation: `orders.modify:${orderId}`, fingerprint: body, successStatus: HttpStatus.OK },
      (manager) => this.reservations.modify(orderId, principal.sub, toModifyInput(body), manager)
        .then((reservation) => toOrderDetail(reservation, publicBaseUrl(this.config, req))),
    );
    return respond(res, result);
  }

  /** Confirmado con el equipo de integración: 200 sin cuerpo. */
  @Post(':orderId/cancel')
  @RequireScopes(AutosScope.Cancel)
  @UseGuards(IdempotencyKeyGuard)
  async cancel(
    @Param('orderId') orderId: string,
    @Headers('idempotency-key') key: string,
    @CurrentPrincipal() principal: IntegrationPrincipal,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.idempotency.execute(
      { ownerSub: principal.sub, key, operation: `orders.cancel:${orderId}`, fingerprint: {}, successStatus: HttpStatus.OK },
      async (manager) => {
        await this.reservations.cancel(orderId, principal.sub, manager);
        return null;
      },
    );
    respond(res, result);
  }
}

/** Aplica el status (201/200) y marca las respuestas reproducidas por idempotencia. */
function respond<T>(res: Response, result: IdempotentResult<T>): T | undefined {
  res.status(result.status);
  if (result.replayed) res.setHeader('Idempotent-Replayed', 'true');
  return result.body ?? undefined;
}

function toModifyInput(body: OrderModifyRequestDto): ModifyReservationInput {
  const route = body.route;
  return {
    extrasToAdd: body.extras_to_add,
    extrasToRemove: body.extras_to_remove,
    ...(route
      ? {
          pickupAt: new Date(route.pickup.datetime),
          dropoffAt: new Date(route.dropoff.datetime),
          pickupLocation: { airport: route.pickup.location.airport, cityId: route.pickup.location.city_id, coordinates: route.pickup.location.coordinates },
          dropoffLocation: { airport: route.dropoff.location.airport, cityId: route.dropoff.location.city_id, coordinates: route.dropoff.location.coordinates },
        }
      : {}),
  };
}
