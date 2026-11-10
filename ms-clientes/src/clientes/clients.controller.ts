import { Body, Controller, Get, Logger, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiKeyGuard, ServiceGuard } from '../common/auth.guards';
import { correlationIdOf, V3Code, V3Error } from '../common/problem-details-v3';
import { ClientsService, maskEmail } from './clients.service';
import { parseClientCreate, parseClientLookup, toClientResponse } from './v3-clients';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Contrato v3.1 con Booking (/api/v3/clientes, con X-API-Key): mismas rutas y respuestas que tenía el monolito;
 * el gateway las enruta a este servicio.
 */
@Controller('api/v3/clientes')
@UseGuards(ApiKeyGuard)
export class ClientsV3Controller {
  private readonly logger = new Logger(ClientsV3Controller.name);

  constructor(private readonly clients: ClientsService) {}

  /** ¿El conductor ya existe? 200 con el cliente o 404 (Booking consulta antes de reservar para no duplicarlo). */
  @Get()
  async find(@Query() query: Record<string, unknown>, @Req() req: Request) {
    const criteria = parseClientLookup(query);
    const client = await this.clients.find(criteria);
    this.logger.log(`Cliente consultado ${criteria.identification ?? ''} ${criteria.email ? maskEmail(criteria.email) : ''} → ${client ? client.id : 'no existe'} cid=${correlationIdOf(req)}`);
    if (!client) throw new V3Error(404, V3Code.NotFound, 'Cliente no encontrado', 'No hay un cliente con ese correo o identificación');
    return toClientResponse(client);
  }

  /** Registra al conductor: 201 si es nuevo; 200 con el mismo client_id si ya existía (nunca se duplica). */
  @Post()
  async create(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { client, created } = await this.clients.findOrCreate({ ...parseClientCreate(body), source: 'BOOKING' });
    this.logger.log(`Alta de cliente ${client.id} → ${created ? 'creado' : 'ya existía'} cid=${correlationIdOf(req)}`);
    res.status(created ? 201 : 200);
    return { ...toClientResponse(client), existente: !created };
  }
}

/**
 * API interna para ms-reservas (no la enruta el gateway). ms-reservas reenvía la credencial de quien originó la
 * operación: la X-API-Key de Booking al vincular una reserva, o el token del administrador en el panel.
 */
@Controller('internal/clientes')
@UseGuards(ServiceGuard)
export class ClientsInternalController {
  constructor(private readonly clients: ClientsService) {}

  /** Búsqueda parcial por identificación (mostrador). */
  @Get()
  async search(@Query('identificacion') identification?: string) {
    return (await this.clients.search(identification ?? '')).map(toClientResponse);
  }

  @Get(':id')
  async byId(@Param('id') id: string) {
    const client = UUID.test(id) ? await this.clients.findById(id) : null;
    if (!client) throw new V3Error(404, V3Code.NotFound, 'Cliente no encontrado', 'No hay un cliente con ese client_id');
    return toClientResponse(client);
  }

  /** Busca o registra (mismas reglas que POST /api/v3/clientes); "origen" indica de dónde viene el cliente. */
  @Post()
  async findOrCreate(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const { source, ...input } = parseClientCreate(body);
    const { client, created } = await this.clients.findOrCreate({ ...input, source: source ?? 'BOOKING' });
    res.status(created ? 201 : 200);
    return { ...toClientResponse(client), existente: !created };
  }
}
