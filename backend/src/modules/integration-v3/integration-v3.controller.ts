import { Body, Controller, Get, Headers, HttpCode, Param, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { correlationIdOf } from '../../common/problem-details/problem-details-v3';
import { ApiKeyGuard } from './api-key.guard';
import { EventsFeedService } from './events-feed.service';
import { PromotionsService } from './promotions.service';
import { CatalogQuery, V3CatalogService } from './v3-catalog.service';
import { V3OrdersService } from './v3-orders.service';

/**
 * Contrato v3 con Booking Prototipo (autos-openapi-v3.yaml), base /api/v3. Booking registra la tienda con
 * Base URL = https://<tienda>/api/v3 y llama rutas cortas (/health, /reservas, /orders/{id}/cancel); por eso
 * cada operación acepta también esos alias, además de las rutas del contrato (/autos/...).
 *
 * Público (security: [] en el contrato): salud y catálogo. Con X-API-Key: reservas, órdenes, cancelación,
 * PUT de promociones y feed de eventos.
 */
@ApiExcludeController()
@Controller('api/v3')
export class IntegrationV3Controller {
  constructor(
    private readonly catalog: V3CatalogService,
    private readonly orders: V3OrdersService,
    private readonly promotions: PromotionsService,
    private readonly events: EventsFeedService,
  ) {}

  // ── Telemetría ──────────────────────────────────────────────────────────
  @Get(['health', 'autos/health'])
  health() {
    return this.catalog.health();
  }

  @Get('autos/eventos')
  @UseGuards(ApiKeyGuard)
  eventsFeed(@Query('limit') limit?: string, @Query('after') after?: string) {
    return this.events.list(limit, after);
  }

  // ── Promociones B2B ─────────────────────────────────────────────────────
  @Get('autos/promociones/contrato')
  getPromotions() {
    return this.promotions.get();
  }

  @Put('autos/promociones/contrato')
  @UseGuards(ApiKeyGuard)
  updatePromotions(@Body() body: unknown, @Headers('x-node-id') nodeId?: string) {
    return this.promotions.update(body, nodeId?.slice(0, 200) ?? 'booking-prototipo');
  }

  // ── Órdenes ─────────────────────────────────────────────────────────────
  @Post(['reservas', 'orders/create', 'autos/reservas', 'autos/orders/create'])
  @UseGuards(ApiKeyGuard)
  async createOrder(
    @Body() body: unknown, @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: Request, @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.orders.create(body, idempotencyKey, correlationIdOf(req));
    res.status(result.status);
    if (result.replayed) res.setHeader('Idempotent-Replayed', 'true');
    return result.body;
  }

  @Get(['orders', 'autos/orders'])
  @UseGuards(ApiKeyGuard)
  listOrders() {
    return this.orders.list();
  }

  @Get(['orders/:orderId', 'reservas/:orderId', 'autos/orders/:orderId'])
  @UseGuards(ApiKeyGuard)
  getOrder(@Param('orderId') orderId: string) {
    return this.orders.get(orderId);
  }

  @Post(['orders/:orderId/cancel', 'reservas/:orderId/cancel', 'autos/orders/:orderId/cancel', 'autos/reservas/:orderId/cancel'])
  @HttpCode(200)
  @UseGuards(ApiKeyGuard)
  cancelOrder(@Param('orderId') orderId: string, @Body() body: unknown, @Req() req: Request) {
    return this.orders.cancel(orderId, body, correlationIdOf(req));
  }

  // ── Catálogo (al final: "autos/:id" no debe tapar las rutas anteriores) ──
  @Get('autos')
  listVehicles(@Query() query: CatalogQuery) {
    return this.catalog.list(query);
  }

  @Get('autos/:id')
  getVehicle(@Param('id') id: string) {
    return this.catalog.get(id);
  }
}
