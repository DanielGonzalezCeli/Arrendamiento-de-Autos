import { Controller, Get, Inject, Res } from '@nestjs/common';
import { Response } from 'express';

import { GatewayConfig } from './config';

export const GATEWAY_CONFIG = Symbol('GATEWAY_CONFIG');

const CHECK_TIMEOUT_MS = 3_000;

interface ServiceHealth {
  status: 'UP' | 'DOWN';
  latency_ms: number;
  detail?: string;
}

/**
 * Salud agregada: el gateway consulta el `/health` de cada microservicio en paralelo.
 * 200 `HEALTHY` si todos responden; 503 `DEGRADED` si alguno falla (y dice cuál).
 */
@Controller('gateway')
export class HealthController {
  constructor(@Inject(GATEWAY_CONFIG) private readonly config: GatewayConfig) {}

  @Get('health')
  async health(@Res() res: Response) {
    const entries = await Promise.all(
      Object.entries(this.config.services).map(async ([name, url]) => [name, await check(url)] as const),
    );
    const services = Object.fromEntries(entries);
    const healthy = entries.every(([, s]) => s.status === 'UP');
    res.setHeader('Cache-Control', 'no-store');
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'HEALTHY' : 'DEGRADED',
      gateway: 'UP',
      services,
      timestamp: new Date().toISOString(),
    });
  }
}

async function check(baseUrl: string): Promise<ServiceHealth> {
  const started = Date.now();
  try {
    const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
    const latency = Date.now() - started;
    return response.ok ? { status: 'UP', latency_ms: latency } : { status: 'DOWN', latency_ms: latency, detail: `HTTP ${response.status}` };
  } catch (error) {
    return { status: 'DOWN', latency_ms: Date.now() - started, detail: (error as Error).name === 'TimeoutError' ? 'timeout' : (error as Error).message };
  }
}
