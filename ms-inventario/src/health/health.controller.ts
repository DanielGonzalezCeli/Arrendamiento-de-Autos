import { Controller, Get, Res } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Response } from 'express';
import { DataSource } from 'typeorm';
import { FleetEventsConsumer } from '../messaging/fleet-events.consumer';

/**
 * Health check (Azure y el gateway): 200 si la BD responde, 503 si no. El estado de RabbitMQ se informa pero no
 * marca el servicio como caído: sin broker, el servicio reintenta solo y los eventos esperan en la cola.
 */
@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly consumer: FleetEventsConsumer,
  ) {}

  @Get()
  async check(@Res() res: Response) {
    let database = 'up';
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      database = 'down';
    }
    res.status(database === 'up' ? 200 : 503).json({
      status: database === 'up' ? 'ok' : 'error',
      service: 'ms-inventario',
      database,
      broker: this.consumer.connected ? 'up' : 'down',
      timestamp: new Date().toISOString(),
    });
  }
}
