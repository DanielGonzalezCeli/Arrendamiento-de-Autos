import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FleetStatusModule } from '../fleet-status/fleet-status.module';
import { StockSyncLog } from './entities/stock-sync-log.entity';
import { StockSyncState } from './entities/stock-sync-state.entity';
import { StockSyncService } from './stock-sync.service';

/** Cliente gRPC del inventory.proto hacia Booking (futuro ms_inventory). */
@Module({
  imports: [TypeOrmModule.forFeature([StockSyncState, StockSyncLog]), FleetStatusModule],
  providers: [StockSyncService],
  exports: [StockSyncService],
})
export class StockSyncModule {}
