import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../common/admin.guard';
import { FleetEventsConsumer } from '../messaging/fleet-events.consumer';
import { StockSyncService } from './stock-sync.service';

/** API interna para ms-reservas (no la enruta el gateway): estado del envío de stock para el panel /admin/booking. */
@Controller('internal/stock')
@UseGuards(AdminGuard)
export class StockController {
  constructor(
    private readonly stock: StockSyncService,
    private readonly consumer: FleetEventsConsumer,
  ) {}

  @Get()
  async overview() {
    return {
      ...(await this.stock.overview()),
      broker: { connected: this.consumer.connected, exchange: this.consumer.exchange, queue: this.consumer.queue, processed: this.consumer.processed },
    };
  }
}
