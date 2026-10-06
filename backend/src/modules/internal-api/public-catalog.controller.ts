import { Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { BUSINESS_RULES } from '../../domain/business-rules';
import { LocationQuery } from '../../domain/depot-locator';
import { DomainError } from '../../domain/domain-error';
import { OrderChannel } from '../../domain/enums';
import { CatalogService } from '../catalog/catalog.service';
import { MediaService } from '../media/media.service';
import { SearchService } from '../search/search.service';
import { InternalSearchDto } from './dto/internal-search.dto';
import { toExtra, toLocations, toSearchResult, toVehicleSummary } from './mappers/public-catalog.mapper';

/** País del comprador por defecto en el marketplace (Ecuador). */
const WEB_BOOKER_COUNTRY = 'ec';

/** API interna pública (sin login): lo que necesita el marketplace para buscar y mostrar vehículos. */
@ApiTags('Marketplace — catálogo')
@Controller()
export class PublicCatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly search: SearchService,
    private readonly media: MediaService,
  ) {}

  @Get('locations')
  @ApiOperation({ summary: 'Ciudades, aeropuertos y agencias para el buscador' })
  async locations() {
    return toLocations(await this.catalog.activeDepots());
  }

  @Get('categories')
  @ApiOperation({ summary: 'Categorías de vehículo' })
  async categories() {
    const categories = await this.catalog.listCategories();
    return categories.map((c) => ({ code: c.code, name: c.name, description: c.description, minDriverAge: c.minDriverAge }));
  }

  @Get('extras')
  @ApiOperation({ summary: 'Extras disponibles (precios en USD por día)' })
  async extras() {
    return (await this.catalog.activeExtras()).map(toExtra);
  }

  @Get('vehicles/:id')
  @ApiOperation({ summary: 'Detalle de un modelo publicado' })
  async vehicle(@Param('id', ParseUUIDPipe) id: string) {
    const model = await this.catalog.findPublishedModel(id);
    if (!model) throw new NotFoundException('Vehículo no encontrado');
    return toVehicleSummary(model);
  }

  @Get('images/:id')
  @ApiOperation({ summary: 'Foto subida desde el panel (inmutable: cada subida tiene su propio id)' })
  async image(@Param('id') id: string, @Res() res: Response) {
    const image = await this.media.find(id);
    res.set({
      'Content-Type': image.contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      // La web vive en otro dominio: helmet bloquea por defecto los recursos de origen cruzado
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    res.send(image.data);
  }

  @Post('search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Buscar vehículos disponibles (misma lógica que POST /autos/v1/search)' })
  async searchVehicles(@Body() dto: InternalSearchDto) {
    const pickupLocation = toLocationQuery(dto.pickupDepotId, dto.pickupCityId, dto.pickupAirport, 'pickup');
    const dropoffLocation = hasLocation(dto.dropoffDepotId, dto.dropoffCityId, dto.dropoffAirport)
      ? toLocationQuery(dto.dropoffDepotId, dto.dropoffCityId, dto.dropoffAirport, 'dropoff')
      : pickupLocation;

    const outcome = await this.search.search({
      channel: OrderChannel.Web,
      pickupAt: new Date(dto.pickupAt),
      dropoffAt: new Date(dto.dropoffAt),
      pickupLocation,
      dropoffLocation,
      driverAge: dto.driverAge,
      bookerCountry: WEB_BOOKER_COUNTRY,
      currency: dto.currency ?? BUSINESS_RULES.BASE_CURRENCY,
      carTypes: dto.carTypes,
      transmissions: dto.transmissions,
      request: dto as unknown as Record<string, unknown>,
    });
    return toSearchResult(outcome);
  }
}

function hasLocation(depotId?: number, cityId?: number, airport?: string): boolean {
  return depotId !== undefined || cityId !== undefined || !!airport;
}

function toLocationQuery(depotId: number | undefined, cityId: number | undefined, airport: string | undefined, prefix: string): LocationQuery {
  if (!hasLocation(depotId, cityId, airport)) {
    throw DomainError.validation('Indica el lugar de recogida', [{ name: `${prefix}DepotId`, reason: 'se requiere agencia, ciudad o aeropuerto' }]);
  }
  return { depotId, cityId, airport };
}
