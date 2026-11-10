import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Put, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../domain/enums';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser, Roles } from '../auth/decorators';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserJwtGuard } from '../auth/guards/user-jwt.guard';
import { toReservationView } from '../internal-api/mappers/reservation.mapper';
import { MAX_IMAGE_BYTES, MediaService, UploadedImage } from '../media/media.service';
import { BookingCheckinService } from '../orders/booking-checkin.service';
import { RentalOperationsService } from '../orders/rental-operations.service';
import { ReservationService } from '../orders/reservation.service';
import { AdminOperationsService } from './admin-operations.service';
import { BookingAdminService } from './booking-admin.service';
import { CatalogAdminService } from './catalog-admin.service';
import { DepotAdminService } from './depot-admin.service';
import {
  CategoryDto, ChargeSettingsDto, CityDto, DepotDto, ExtraDto, FleetUnitDto, PickupDto, RateDto, ReservationFiltersDto, ReturnDto, SupplierDto,
  UpdateCategoryDto, UpdateDepotDto, UpdateExtraDto, UpdateFleetUnitDto, UpdateRateDto, UpdateSupplierDto,
  UpdateVehicleModelDto, VehicleBlockDto, VehicleModelDto,
} from './dto/admin.dto';
import { FleetAdminService } from './fleet-admin.service';
import { IntegrationAdminService } from './integration-admin.service';
import { InvoiceService } from '../invoices/invoice.service';
import { sendDocument } from '../invoices/invoices.controller';
import { Request, Response } from 'express';
import { adminCallContext } from '../clients/clients.client';
import { ChargeSettingsService } from '../orders/charge-settings.service';
import { ReturnInput } from '../orders/rental-operations.service';

/**
 * Panel de administración (/api/admin/*). Solo usuarios con rol ADMIN: la protección está aquí
 * (UserJwtGuard + RolesGuard), no solo en la interfaz.
 */
@ApiTags('Administración')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(UserJwtGuard, RolesGuard)
@Roles(UserRole.Admin)
export class AdminController {
  constructor(
    private readonly operations: AdminOperationsService,
    private readonly catalog: CatalogAdminService,
    private readonly fleet: FleetAdminService,
    private readonly depots: DepotAdminService,
    private readonly integration: IntegrationAdminService,
    private readonly booking: BookingAdminService,
    private readonly invoices: InvoiceService,
    private readonly chargeSettingsService: ChargeSettingsService,
    private readonly reservations: ReservationService,
    private readonly rentals: RentalOperationsService,
    private readonly media: MediaService,
    private readonly checkins: BookingCheckinService,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Indicadores del día, flota, ingresos del mes y estado de la integración' })
  dashboard() {
    return this.operations.dashboard();
  }

  // ── Reservas ──────────────────────────────────────────────────────────────
  @Get('reservations')
  listReservations(@Query() filters: ReservationFiltersDto, @Req() req: Request) {
    return this.operations.listReservations(filters, adminCallContext(req));
  }

  @Get('reservations/:id')
  reservation(@Param('id') id: string, @Req() req: Request) {
    return this.operations.reservationDetail(id, adminCallContext(req));
  }

  @Post('reservations/:id/pickup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Registrar la entrega (check-in de mostrador): asigna una placa libre y avisa a Booking si la reserva vino de allá' })
  async pickUp(@Param('id') id: string, @Body() dto: PickupDto, @CurrentUser() user: AuthUser, @Req() req: Request) {
    await this.rentals.pickUp(id, dto, `admin:${user.id}`);
    await this.checkins.dispatch(id); // contrato v3.1: check-in a Booking (si falla, queda en el outbox y se reintenta)
    return this.operations.reservationDetail(id, adminCallContext(req));
  }

  @Post('reservations/:id/return')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Registrar la devolución (la unidad queda en la agencia de devolución)' })
  async return(@Param('id') id: string, @Body() dto: ReturnDto, @CurrentUser() user: AuthUser, @Req() req: Request) {
    await this.rentals.return(id, toReturnInput(dto), `admin:${user.id}`);
    return this.operations.reservationDetail(id, adminCallContext(req));
  }

  @Post('reservations/:id/return/preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Calcular los cargos de la devolución sin registrarla (RN28)' })
  previewReturn(@Param('id') id: string, @Body() dto: ReturnDto) {
    return this.rentals.previewReturn(id, toReturnInput(dto));
  }

  @Get('charge-settings')
  @ApiOperation({ summary: 'Precios del combustible y tarifas de los cargos de devolución' })
  chargeSettings() { return this.chargeSettingsService.get(); }

  @Put('charge-settings')
  @ApiOperation({ summary: 'Actualizar precios del combustible y tarifas de cargos' })
  updateChargeSettings(@Body() dto: ChargeSettingsDto, @CurrentUser() user: AuthUser) {
    return this.chargeSettingsService.update(dto, `admin:${user.id}`);
  }

  @Post('reservations/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancelar una reserva de cualquier cliente (emite CAR_ORDER_CANCELLED)' })
  async cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return toReservationView(await this.reservations.cancelAsAdmin(id, `admin:${user.id}`));
  }

  // ── Imágenes (fotos de los modelos) ───────────────────────────────────────
  @Post('images')
  @ApiOperation({ summary: 'Subir una foto (JPG, PNG o WebP, máx. 2 MB); devuelve la URL para el modelo' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } }, required: ['file'] } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } }))
  uploadImage(@UploadedFile() file: UploadedImage | undefined, @CurrentUser() user: AuthUser) {
    return this.media.upload(file, user.id);
  }

  // ── Modelos y flota ───────────────────────────────────────────────────────
  @Get('models') listModels() { return this.catalog.listModels(); }
  @Post('models') createModel(@Body() dto: VehicleModelDto) { return this.catalog.createModel(dto); }
  @Patch('models/:id') updateModel(@Param('id') id: string, @Body() dto: UpdateVehicleModelDto) { return this.catalog.updateModel(id, dto); }

  @Get('fleet')
  @ApiQuery({ name: 'vehicleModelId', required: false })
  @ApiQuery({ name: 'depotId', required: false })
  listUnits(@Query('vehicleModelId') vehicleModelId?: string, @Query('depotId') depotId?: string) {
    return this.fleet.listUnits({ vehicleModelId, depotId: depotId ? Number(depotId) : undefined });
  }
  @Post('fleet') createUnit(@Body() dto: FleetUnitDto) { return this.fleet.createUnit(dto); }
  @Patch('fleet/:id') updateUnit(@Param('id') id: string, @Body() dto: UpdateFleetUnitDto) { return this.fleet.updateUnit(id, dto); }
  @Get('fleet/:id/blocks') listBlocks(@Param('id') id: string) { return this.fleet.listBlocks(id); }
  @Post('fleet/:id/blocks')
  createBlock(@Param('id') id: string, @Body() dto: VehicleBlockDto, @CurrentUser() user: AuthUser) {
    return this.fleet.createBlock(id, dto, user.id);
  }
  @Delete('blocks/:id') @HttpCode(HttpStatus.NO_CONTENT) async deleteBlock(@Param('id') id: string) { await this.fleet.deleteBlock(id); }

  // ── Agencias y ciudades ───────────────────────────────────────────────────
  @Get('depots') listDepots() { return this.depots.list(); }
  @Post('depots') createDepot(@Body() dto: DepotDto) { return this.depots.create(dto); }
  @Patch('depots/:id') updateDepot(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDepotDto) { return this.depots.update(id, dto); }
  @Get('cities') listCities() { return this.catalog.listCities(); }
  @Post('cities') createCity(@Body() dto: CityDto) { return this.catalog.createCity(dto); }

  // ── Catálogos comerciales ─────────────────────────────────────────────────
  @Get('categories') listCategories() { return this.catalog.listCategories(); }
  @Post('categories') createCategory(@Body() dto: CategoryDto) { return this.catalog.createCategory(dto); }
  @Patch('categories/:id') updateCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto) { return this.catalog.updateCategory(id, dto); }

  @Get('suppliers') listSuppliers() { return this.catalog.listSuppliers(); }
  @Post('suppliers') createSupplier(@Body() dto: SupplierDto) { return this.catalog.createSupplier(dto); }
  @Patch('suppliers/:id') updateSupplier(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSupplierDto) { return this.catalog.updateSupplier(id, dto); }

  @Get('extras') listExtras() { return this.catalog.listExtras(); }
  @Post('extras') createExtra(@Body() dto: ExtraDto) { return this.catalog.createExtra(dto); }
  @Patch('extras/:id') updateExtra(@Param('id') id: string, @Body() dto: UpdateExtraDto) { return this.catalog.updateExtra(id, dto); }

  @Get('rates') listRates() { return this.catalog.listRates(); }
  @Post('rates') createRate(@Body() dto: RateDto) { return this.catalog.createRate(dto); }
  @Patch('rates/:id') updateRate(@Param('id') id: string, @Body() dto: UpdateRateDto) { return this.catalog.updateRate(id, dto); }
  @Delete('rates/:id') @HttpCode(HttpStatus.NO_CONTENT) async deleteRate(@Param('id') id: string) { await this.catalog.deleteRate(id); }

  // ── Usuarios ──────────────────────────────────────────────────────────────
  // Las cuentas (/api/admin/users) las gestiona ms-identidad; ms-reservas solo informa el historial de cada una.
  @Get('user-usage')
  @ApiOperation({ summary: 'Reservas, reseñas y bloqueos de flota por usuario (lo consulta ms-identidad)' })
  userUsage() { return this.operations.userUsage(); }

  // ── Integración (Booking Hub) ─────────────────────────────────────────────
  @Get('integration') integrationOverview() { return this.integration.overview(); }
  @Post('integration/deliveries/:id/retry') @HttpCode(HttpStatus.OK)
  retryDelivery(@Param('id') id: string) { return this.integration.retryDelivery(id); }
  @Post('integration/dispatch') @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Procesar ahora el outbox y las entregas pendientes' })
  dispatchNow() { return this.integration.dispatchNow(); }

  // ── Facturación (RN27) ────────────────────────────────────────────────────
  @Get('invoices')
  @ApiOperation({ summary: 'Últimos comprobantes emitidos (facturas y notas de crédito)' })
  @ApiQuery({ name: 'q', required: false, description: 'Número, comprador, identificación o localizador' })
  listInvoices(@Query('q') q?: string) { return this.invoices.listRecent(q); }
  @Get('invoices/:id/pdf')
  async invoicePdf(@Param('id') id: string, @Res() res: Response) { sendDocument(res, await this.invoices.document(id, 'pdf', null)); }
  @Get('invoices/:id/xml')
  async invoiceXml(@Param('id') id: string, @Res() res: Response) { sendDocument(res, await this.invoices.document(id, 'xml', null)); }

  // ── Booking Prototipo (contrato v3 + inventory.proto) ─────────────────────
  @Get('booking')
  @ApiOperation({ summary: 'Estado de la integración v3: configuración, flota, stock enviado y reservas de Booking' })
  bookingOverview() { return this.booking.overview(); }
  @Post('booking/sync') @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reconciliar ahora el stock con Booking (PushStockUpdate)' })
  bookingSyncNow() { return this.booking.syncNow(); }
}

function toReturnInput(dto: ReturnDto): ReturnInput {
  return { ...dto, returnedAt: dto.returnedAt ? new Date(dto.returnedAt) : undefined };
}
