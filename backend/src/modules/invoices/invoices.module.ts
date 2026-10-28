import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invoice } from './entities/invoice.entity';
import { InvoiceSequence } from './entities/invoice-sequence.entity';
import { InvoiceService } from './invoice.service';
import { InvoicesController } from './invoices.controller';

/** Facturación electrónica (formato SRI): facturas y notas de crédito de las reservas. Candidato a microservicio. */
@Module({
  imports: [TypeOrmModule.forFeature([Invoice, InvoiceSequence])],
  controllers: [InvoicesController],
  providers: [InvoiceService],
  exports: [InvoiceService],
})
export class InvoicesModule {}
