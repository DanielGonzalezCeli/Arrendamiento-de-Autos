import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../domain/enums';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser, Roles } from '../auth/decorators';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserJwtGuard } from '../auth/guards/user-jwt.guard';
import { toReservationView } from '../internal-api/mappers/reservation.mapper';
import { MAX_IMAGE_BYTES, MediaService, UploadedImage } from '../media/media.service';
import { RentalOperationsService } from '../orders/rental-operations.service';
import { ReservationService } from '../orders/reservation.service';
import { AdminOperationsService } from './admin-operations.service';
import { CatalogAdminService } from './catalog-admin.service';
import { DepotAdminService } from './depot-admin.service';
import {
  CategoryDto, CityDto, DepotDto, ExtraDto, FleetUnitDto, PickupDto, RateDto, ReservationFiltersDto, ReturnDto, SupplierDto,
  UpdateCategoryDto, UpdateDepotDto, UpdateExtraDto, UpdateFleetUnitDto, UpdateRateDto, UpdateSupplierDto, UpdateUserDto,
  UpdateVehicleModelDto, VehicleBlockDto, VehicleModelDto,
} from './dto/admin.dto';
import { FleetAdminService } from './fleet-admin.service';
import { IntegrationAdminService } from './integration-admin.service';

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
    private readonly reservations: ReservationService,
    private readonly rentals: RentalOperationsService,
    private readonly media: MediaService,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Indicadores del día, flota, ingresos del mes y estado de la integración' })
  dashboard() {
    return this.operations.dashboard();
  }

  // ── Reservas ──────────────────────────────────────────────────────────────
  @Get('reservations')
  listReservations(@Query() filters: ReservationFiltersDto) {
    return this.operations.listReservations(filters);
  }

  @Get('reservations/:id')
  reservation(@Param('id') id: string) {
    return this.operations.reservationDetail(id);
  }

  @Post('reservations/:id/pickup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Registrar la entrega: asigna una placa libre del modelo' })
  async pickUp(@Param('id') id: string, @Body() dto: PickupDto, @CurrentUser() user: AuthUser) {
    await this.rentals.pickUp(id, dto, `admin:${user.id}`);
    return this.operations.reservationDetail(id);
  }

  @Post('reservations/:id/return')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Registrar la devolución (la unidad queda en la agencia de devolución)' })
  async return(@Param('id') id: string, @Body() dto: ReturnDto, @CurrentUser() user: AuthUser) {
    await this.rentals.return(id, dto, `admin:${user.id}`);
    return this.operations.reservationDetail(id);
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
  @Get('users') listUsers() { return this.operations.listUsers(); }
  @Patch('users/:id')
  updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() user: AuthUser) {
    return this.operations.updateUser(id, dto, user.id);
  }

  // ── Integración (Booking Hub) ─────────────────────────────────────────────
  @Get('integration') integrationOverview() { return this.integration.overview(); }
  @Post('integration/deliveries/:id/retry') @HttpCode(HttpStatus.OK)
  retryDelivery(@Param('id') id: string) { return this.integration.retryDelivery(id); }
  @Post('integration/dispatch') @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Procesar ahora el outbox y las entregas pendientes' })
  dispatchNow() { return this.integration.dispatchNow(); }
}
