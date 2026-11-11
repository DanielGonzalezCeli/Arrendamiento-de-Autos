import { Controller, Get, Inject, NotFoundException, Param, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';

import { AdminGuard } from './admin-auth';
import { GatewayConfig } from './config';
import { GATEWAY_CONFIG } from './health.controller';
import { metrics } from './metrics';

const SCRAPE_TIMEOUT_MS = 3_000;

/**
 * Métricas Prometheus (fase E), solo para ADMIN:
 *  - /gateway/metrics: las del propio gateway.
 *  - /gateway/metrics/{servicio}: las de un microservicio (el gateway las pide a su /metrics, que no es público).
 * Un Prometheus puede leerlas con el token como bearer; la página "Observabilidad" del panel también las usa.
 */
@Controller('gateway/metrics')
@UseGuards(AdminGuard)
export class MetricsController {
  constructor(@Inject(GATEWAY_CONFIG) private readonly config: GatewayConfig) {}

  @Get()
  async own(@Res() res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    res.type(metrics.contentType).send(await metrics.metrics());
  }

  @Get(':service')
  async service(@Param('service') service: string, @Res() res: Response) {
    const baseUrl = this.config.services[service];
    if (!baseUrl) throw new NotFoundException(`No hay un microservicio llamado ${service}`);
    res.setHeader('Cache-Control', 'no-store');
    try {
      const upstream = await fetch(`${baseUrl}/metrics`, { signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS) });
      if (!upstream.ok) throw new Error(`HTTP ${upstream.status}`);
      res.type(upstream.headers.get('content-type') ?? 'text/plain').send(await upstream.text());
    } catch (error) {
      res.status(502).type('text/plain').send(`# ${service} no respondió: ${(error as Error).message}\n`);
    }
  }
}
