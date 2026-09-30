import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, NotImplementedException, Param, ParseUUIDPipe, Post, UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { IdempotencyKeyGuard } from '../../common/guards/idempotency-key.guard';
import { AutosScope, IntegrationAuthGuard, RequireScopes } from '../integration-auth/integration-auth.guard';

const PENDING = 'Operación en construcción (Fases 8, 11 y 12 del plan)';

/**
 * API de integración — "Gestión de Órdenes (Reservas)" y "Webhooks".
 * Seguridad ya aplicada según el contrato (OAuth2 + scope por endpoint, Idempotency-Key donde se exige).
 * La lógica se conecta en las siguientes fases; mientras tanto responden 501 en lugar de datos falsos.
 */
@ApiExcludeController()
@Controller()
@UseGuards(IntegrationAuthGuard)
export class OrdersController {
  @Post('orders/hold')
  @HttpCode(HttpStatus.OK)
  @RequireScopes(AutosScope.Book)
  hold(@Body() _body: unknown) {
    throw new NotImplementedException(PENDING);
  }

  @Post('orders/preview')
  @HttpCode(HttpStatus.OK)
  @RequireScopes(AutosScope.Read)
  preview(@Body() _body: unknown) {
    throw new NotImplementedException(PENDING);
  }

  @Post('orders/create')
  @HttpCode(HttpStatus.CREATED)
  @RequireScopes(AutosScope.Book)
  @UseGuards(IdempotencyKeyGuard)
  create(@Body() _body: unknown) {
    throw new NotImplementedException(PENDING);
  }

  @Get('orders/:orderId')
  @RequireScopes(AutosScope.Read)
  getOrder(@Param('orderId', ParseUUIDPipe) _orderId: string) {
    throw new NotImplementedException(PENDING);
  }

  @Post('orders/:orderId/modify')
  @HttpCode(HttpStatus.OK)
  @RequireScopes(AutosScope.Book)
  @UseGuards(IdempotencyKeyGuard)
  modify(@Param('orderId', ParseUUIDPipe) _orderId: string, @Body() _body: unknown) {
    throw new NotImplementedException(PENDING);
  }

  @Post('orders/:orderId/cancel')
  @HttpCode(HttpStatus.OK)
  @RequireScopes(AutosScope.Cancel)
  @UseGuards(IdempotencyKeyGuard)
  cancel(@Param('orderId', ParseUUIDPipe) _orderId: string) {
    throw new NotImplementedException(PENDING);
  }

  @Get('webhooks')
  @RequireScopes(AutosScope.Webhooks)
  listWebhooks() {
    throw new NotImplementedException(PENDING);
  }

  @Post('webhooks')
  @HttpCode(HttpStatus.CREATED)
  @RequireScopes(AutosScope.Webhooks)
  createWebhook(@Body() _body: unknown) {
    throw new NotImplementedException(PENDING);
  }

  @Delete('webhooks/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireScopes(AutosScope.Webhooks)
  deleteWebhook(@Param('id', ParseUUIDPipe) _id: string) {
    throw new NotImplementedException(PENDING);
  }
}
