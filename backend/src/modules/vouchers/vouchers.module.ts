import { Module } from '@nestjs/common';
import { VoucherService } from './voucher.service';
import { VouchersController } from './vouchers.controller';

/** Vouchers de reserva (link firmado, QR y PDF). Candidato a microservicio propio. */
@Module({
  controllers: [VouchersController],
  providers: [VoucherService],
  exports: [VoucherService],
})
export class VouchersModule {}
