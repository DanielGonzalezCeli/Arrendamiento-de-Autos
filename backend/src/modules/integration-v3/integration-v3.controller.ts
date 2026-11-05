import { Body, Controller, Get, Headers, HttpCode, Logger, Param, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { correlationIdOf, v3Error, V3Code } from '../../common/problem-details/problem-details-v3';
import { ClientsService, maskEmail } from '../clients/clients.service';
import { ApiKeyGuard } from './api-key.guard';
import { EventsFeedService } from './events-feed.service';
import { PromotionsService } from './promotions.service';
import { CatalogQuery, V3CatalogService } from './v3-catalog.service';
import { parseClientCreate, parseClientLookup, toClientResponse } from './v3-clients';
import { V3OrdersService } from './v3-orders.service';

/**
 * Contrato v3 con Booking Prototipo (autos-openapi-v3.yaml), base /api/v3. Booking registra la tienda con
 * Base URL = https://<tienda>/api/v3 y llama rutas cortas (/health, /reservas, /orders/{id}/cancel); por eso
 * cada operación acepta también esos alias, además de las rutas del contrato (/autos/...). La guía de socios de
 * Booking agrega POST /autos/search y POST /autos/orders (este último con el body del contrato v3).
 *
 * Público (security: [] en el contrato): salud y catálogo. Con X-API-Key: reservas, órdenes, cancelación,
 * PUT de promociones, feed de eventos y clientes (v3.1).
 */
@ApiExcludeController()
@Controller('api/v3')
export class IntegrationV3Controller {
  private readonly logger = new Logger(IntegrationV3Controller.name);

  constructor(
    private readonly catalog: V3CatalogService,
    private readonly orders: V3OrdersService,
    private readonly promotions: PromotionsService,
    private readonly events: EventsFeedService,
    private readonly clients: ClientsService,
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

  // ── Clientes cross-platform (contrato v3.1) ─────────────────────────────
  /** ¿El conductor ya existe? 200 con el cliente o 404 (Booking consulta antes de reservar para no duplicarlo). */
  @Get('clientes')
  @UseGuards(ApiKeyGuard)
  async findClient(@Query() query: Record<string, unknown>, @Req() req: Request) {
    const criteria = parseClientLookup(query);
    const client = await this.clients.find(criteria);
    this.logger.log(`Cliente consultado ${criteria.identification ?? ''} ${criteria.email ? maskEmail(criteria.email) : ''} → ${client ? client.id : 'no existe'} cid=${correlationIdOf(req)}`);
    if (!client) throw v3Error(404, V3Code.NotFound, 'Cliente no encontrado', 'No hay un cliente con ese correo o identificación');
    return toClientResponse(client);
  }

  /** Registra al conductor: 201 si es nuevo; 200 con el mismo client_id si ya existía (nunca se duplica). */
  @Post('clientes')
  @UseGuards(ApiKeyGuard)
  async createClient(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { client, created } = await this.clients.findOrCreate({ ...parseClientCreate(body), source: 'BOOKING' });
    this.logger.log(`Alta de cliente ${client.id} → ${created ? 'creado' : 'ya existía'} cid=${correlationIdOf(req)}`);
    res.status(created ? 201 : 200);
    return { ...toClientResponse(client), existente: !created };
  }

  // ── Órdenes ─────────────────────────────────────────────────────────────
  @Post(['reservas', 'orders', 'orders/create', 'autos/reservas', 'autos/orders', 'autos/orders/create'])
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
  /** Guía de socios de Booking: búsqueda por ciudad, fechas y categoría (pública, como GET /autos). */
  @Post('autos/search')
  @HttpCode(200)
  searchVehicles(@Body() body: unknown) {
    return this.catalog.search(body);
  }

  @Get('autos')
  listVehicles(@Query() query: CatalogQuery) {
    return this.catalog.list(query);
  }

  @Get('autos/:id')
  getVehicle(@Param('id') id: string) {
    return this.catalog.get(id);
  }
}
