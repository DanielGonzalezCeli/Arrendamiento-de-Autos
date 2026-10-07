import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { Response } from 'express';
import { DataSource } from 'typeorm';

/**
 * Health check usado por Render y por el monitor de uptime. Comprueba también la BD.
 * `/api/status` es el mismo chequeo para el indicador de la web: algunos bloqueadores de anuncios
 * bloquean las URLs que terminan en `/health` (ERR_BLOCKED_BY_CLIENT) y el indicador quedaba "sin conexión".
 */
@ApiExcludeController()
@Controller()
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get(['health', 'api/status'])
  async check(@Res() res: Response) {
    const database = await this.pingDatabase();
    const status = database === 'up' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
    res.setHeader('Cache-Control', 'no-store');
    res.status(status).json({
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      timestamp: new Date().toISOString(),
    });
  }

  private async pingDatabase(): Promise<'up' | 'down'> {
    try {
      await this.dataSource.query('SELECT 1');
      return 'up';
    } catch {
      return 'down';
    }
  }
}
