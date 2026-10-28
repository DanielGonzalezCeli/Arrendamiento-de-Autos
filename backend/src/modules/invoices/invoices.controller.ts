import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AuthUser, webOwnerSub } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators';
import { UserJwtGuard } from '../auth/guards/user-jwt.guard';
import { toInvoiceView } from './invoice.mapper';
import { InvoiceService } from './invoice.service';

/** Comprobantes del cliente (Mis reservas): lista por reserva y descarga del RIDE (PDF) o del XML. */
@ApiTags('Marketplace — facturación')
@ApiBearerAuth()
@Controller()
@UseGuards(UserJwtGuard)
export class InvoicesController {
  constructor(private readonly invoices: InvoiceService) {}

  @Get('me/reservations/:id/invoices')
  @ApiOperation({ summary: 'Facturas y notas de crédito de una reserva propia' })
  async list(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return (await this.invoices.listForOwner(id, webOwnerSub(user.id))).map(toInvoiceView);
  }

  @Get('me/invoices/:id/pdf')
  @ApiOperation({ summary: 'RIDE (PDF) de un comprobante propio' })
  pdf(@Param('id') id: string, @CurrentUser() user: AuthUser, @Res() res: Response) {
    return this.send(res, id, 'pdf', webOwnerSub(user.id));
  }

  @Get('me/invoices/:id/xml')
  @ApiOperation({ summary: 'XML (formato SRI) de un comprobante propio' })
  xml(@Param('id') id: string, @CurrentUser() user: AuthUser, @Res() res: Response) {
    return this.send(res, id, 'xml', webOwnerSub(user.id));
  }

  private async send(res: Response, id: string, format: 'pdf' | 'xml', ownerSub: string) {
    const doc = await this.invoices.document(id, format, ownerSub);
    sendDocument(res, doc);
  }
}

export function sendDocument(res: Response, doc: { filename: string; contentType: string; content: Buffer }) {
  res.set({ 'Content-Type': doc.contentType, 'Content-Disposition': `attachment; filename="${doc.filename}"`, 'Cache-Control': 'private, no-store' });
  res.send(doc.content);
}
