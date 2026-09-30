import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { randomBytes } from 'crypto';
import { Response } from 'express';
import { IdempotencyKeyGuard } from '../../common/guards/idempotency-key.guard';
import { OrderChannel } from '../../domain/enums';
import { AuthUser, webOwnerSub } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators';
import { UserJwtGuard } from '../auth/guards/user-jwt.guard';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { HoldService } from '../orders/hold.service';
import { OrderPreviewService } from '../orders/order-preview.service';
import { ReservationService } from '../orders/reservation.service';
import { CheckoutConfirmDto, CheckoutHoldDto, CheckoutPreviewDto, ModifyMyReservationDto } from './dto/checkout.dto';
import { toReservationView } from './mappers/reservation.mapper';

const DRIVER_FIELDS = { firstName: 'driver.firstName', lastName: 'driver.lastName', email: 'driver.email' };

/**
 * Pasarela de pago SIMULADA. El contrato dice que el pago pertenece a otro dominio: la web genera una
 * referencia como lo haría la Payment API y el backend solo la almacena (RN18).
 */
function simulatedPaymentReference(): string {
  return `SIM-${randomBytes(8).toString('hex').toUpperCase()}`;
}

/**
 * API interna — checkout y "Mis reservas". Usa EXACTAMENTE los mismos servicios que la API de
 * integración (HoldService, OrderPreviewService, ReservationService, IdempotencyService).
 * El dueño es "user:<id>" (equivalente al `sub` del contrato).
 */
@ApiTags('Marketplace — reservas')
@ApiBearerAuth()
@Controller()
@UseGuards(UserJwtGuard)
export class CheckoutController {
  constructor(
    private readonly holds: HoldService,
    private readonly previews: OrderPreviewService,
    private readonly reservations: ReservationService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post('checkout/hold')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bloquear el vehículo 15 minutos al precio cotizado' })
  async hold(@Body() dto: CheckoutHoldDto, @CurrentUser() user: AuthUser) {
    const hold = await this.holds.create({ searchToken: dto.searchToken, vehicleId: dto.vehicleId, ownerSub: webOwnerSub(user.id) });
    return { holdId: hold.id, expiresAt: hold.expiresAt };
  }

  @Post('checkout/preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resumen de precio con extras (congela el precio)' })
  async preview(@Body() dto: CheckoutPreviewDto, @CurrentUser() user: AuthUser) {
    const preview = await this.previews.create({
      searchToken: dto.searchToken, vehicleId: dto.vehicleId, holdId: dto.holdId, extras: dto.extras ?? [],
      ownerSub: webOwnerSub(user.id), extrasField: 'extras',
    });
    return { orderPreviewId: preview.id, expiresAt: preview.expiresAt, holdId: preview.holdId, price: preview.breakdown };
  }

  @Post('checkout/confirm')
  @ApiOperation({ summary: 'Confirmar la reserva (pago simulado)' })
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'UUID por intento de compra' })
  @UseGuards(IdempotencyKeyGuard)
  async confirm(
    @Body() dto: CheckoutConfirmDto, @Headers('idempotency-key') key: string, @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ownerSub = webOwnerSub(user.id);
    const result = await this.idempotency.execute(
      { ownerSub, key, operation: 'web.checkout.confirm', fingerprint: dto, successStatus: HttpStatus.CREATED },
      (manager) => this.reservations.create({
        orderPreviewId: dto.orderPreviewId,
        paymentReference: simulatedPaymentReference(),
        driver: dto.driver,
        driverFields: DRIVER_FIELDS,
        ownerSub,
        channel: OrderChannel.Web,
        userId: user.id,
      }, manager).then((r) => toReservationView(r)),
    );
    res.status(result.status);
    return result.body;
  }

  @Get('me/reservations')
  @ApiOperation({ summary: 'Mis reservas' })
  async mine(@CurrentUser() user: AuthUser) {
    return (await this.reservations.listForOwner(webOwnerSub(user.id))).map((r) => toReservationView(r));
  }

  @Get('me/reservations/:id')
  @ApiOperation({ summary: 'Detalle de una reserva propia' })
  async one(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return toReservationView(await this.reservations.getForOwner(id, webOwnerSub(user.id)));
  }

  @Post('me/reservations/:id/modify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Modificar fechas, agencias o extras' })
  async modify(@Param('id') id: string, @Body() dto: ModifyMyReservationDto, @CurrentUser() user: AuthUser) {
    const updated = await this.reservations.modify(id, webOwnerSub(user.id), {
      extrasToAdd: dto.extrasToAdd,
      extrasToRemove: dto.extrasToRemove,
      pickupAt: dto.pickupAt ? new Date(dto.pickupAt) : undefined,
      dropoffAt: dto.dropoffAt ? new Date(dto.dropoffAt) : undefined,
      pickupLocation: dto.pickupDepotId !== undefined ? { depotId: dto.pickupDepotId } : undefined,
      dropoffLocation: dto.dropoffDepotId !== undefined ? { depotId: dto.dropoffDepotId } : undefined,
    });
    return toReservationView(updated);
  }

  @Post('me/reservations/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancelar (gratis hasta 24 h antes)' })
  async cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return toReservationView(await this.reservations.cancel(id, webOwnerSub(user.id)));
  }
}
