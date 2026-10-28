import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { VoucherService } from './voucher.service';

/**
 * Voucher público por link firmado (/voucher/{localizador}?t=…): lo abre el cliente desde el correo o
 * el celular, y el agente al escanear el QR en el mostrador. Sin el token correcto responde 404.
 */
@ApiTags('Marketplace — vouchers')
@Controller('vouchers')
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class VouchersController {
  constructor(private readonly vouchers: VoucherService) {}

  @Get(':locator')
  @ApiOperation({ summary: 'Datos del voucher (con QR en SVG)' })
  @ApiQuery({ name: 't', description: 'Token del link del voucher' })
  view(@Param('locator') locator: string, @Query('t') token: string) {
    return this.vouchers.view(locator, token);
  }

  @Get(':locator/pdf')
  @ApiOperation({ summary: 'Voucher en PDF (descarga)' })
  @ApiQuery({ name: 't', description: 'Token del link del voucher' })
  async pdf(@Param('locator') locator: string, @Query('t') token: string, @Res() res: Response) {
    const { filename, content } = await this.vouchers.pdf(locator, token);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    });
    res.send(content);
  }
}
