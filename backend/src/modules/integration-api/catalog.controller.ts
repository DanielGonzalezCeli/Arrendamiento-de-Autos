import { Body, Controller, Header, HttpCode, HttpStatus, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { decodeCursor, paginate } from '../../common/pagination';
import { RequestId } from '../../common/request-id.decorator';
import { OrderChannel } from '../../domain/enums';
import { CatalogService } from '../catalog/catalog.service';
import { ConstantsService } from '../catalog/constants.service';
import { AffiliateGuard, AffiliateId } from '../integration-auth/affiliate.guard';
import { IntegrationThrottlerGuard } from '../integration-auth/integration-throttler.guard';
import { ReviewsService } from '../reviews/reviews.service';
import { SearchService } from '../search/search.service';
import { DeprecationHeaderInterceptor } from './deprecation-header.interceptor';
import {
  CarConstantsRequestDto, CarDetailsRequestDto, CarSearchRequestDto, DepotScoresRequestDto, DepotsRequestDto, SuppliersRequestDto,
} from './dto/catalog-requests.dto';
import {
  toCarDetailsResponse, toCarSearchResponse, toDepotScoresResponse, toDepotsResponse, toSuppliersResponse,
} from './mappers/catalog.mapper';

/** Límite de /search por afiliado + IP (el resto usa el límite global). */
const SEARCH_LIMIT_PER_MINUTE = 60;

/**
 * API de integración — "Búsqueda y Catálogo", "Información de Agencias y Proveedores" y "Componentes Comunes".
 * Endpoints públicos (security: []) que exigen X-Affiliate-Id. Todos son POST y responden 200 (no 201).
 * La documentación es el contrato (/autos/v1/docs), por eso este controller no aparece en /api/docs.
 */
@ApiExcludeController()
@Controller()
@UseGuards(AffiliateGuard, IntegrationThrottlerGuard)
@UseInterceptors(DeprecationHeaderInterceptor)
export class CatalogController {
  constructor(
    private readonly search: SearchService,
    private readonly catalog: CatalogService,
    private readonly constants: ConstantsService,
    private readonly reviews: ReviewsService,
  ) {}

  /**
   * POST /search. Sin `page`: nueva búsqueda (nuevo search_token). Con `page`: siguiente página
   * de la misma búsqueda (el cursor lleva el search_token), sin recalcular.
   */
  @Post('search')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'public, max-age=300')
  @Throttle({ default: { limit: SEARCH_LIMIT_PER_MINUTE, ttl: 60_000 } })
  async searchCars(@Body() body: CarSearchRequestDto, @AffiliateId() affiliateId: number, @RequestId() requestId: string) {
    if (body.page) {
      const { context: searchToken } = decodeCursor(body.page);
      const session = await this.search.getActiveSession(searchToken ?? '');
      return toCarSearchResponse(requestId, session.id, paginate(session.results, body.maximum_results, body.page, session.id));
    }

    const { session } = await this.search.search({
      channel: OrderChannel.BookingHub,
      affiliateId,
      pickupAt: new Date(body.route.pickup.datetime),
      dropoffAt: new Date(body.route.dropoff.datetime),
      pickupLocation: toLocationQuery(body.route.pickup.location),
      dropoffLocation: toLocationQuery(body.route.dropoff.location),
      driverAge: body.driver.age,
      bookerCountry: body.booker.country,
      currency: body.currency,
      carTypes: body.filters?.car_types,
      transmissions: body.filters?.transmission,
      request: body as unknown as Record<string, unknown>,
    });
    return toCarSearchResponse(requestId, session.id, paginate(session.results, body.maximum_results, undefined, session.id));
  }

  @Post('depots')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'public, max-age=3600')
  async depots(@Body() body: DepotsRequestDto, @RequestId() requestId: string) {
    const depots = await this.catalog.activeDepots(body.last_modified ? new Date(body.last_modified) : undefined);
    return toDepotsResponse(requestId, paginate(depots, body.maximum_results, body.page));
  }

  @Post('depots/reviews/scores')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'public, max-age=600')
  async depotScores(@Body() body: DepotScoresRequestDto, @RequestId() requestId: string) {
    return toDepotScoresResponse(requestId, paginate(await this.reviews.scoresByDepot(), body.maximum_results, body.page));
  }

  @Post('details')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'public, max-age=300')
  async details(@Body() body: CarDetailsRequestDto, @RequestId() requestId: string) {
    const models = await this.catalog.publishedModels(body.last_modified ? new Date(body.last_modified) : undefined);
    return toCarDetailsResponse(requestId, paginate(models, body.maximum_results, body.page));
  }

  @Post('suppliers')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'public, max-age=3600')
  async suppliers(@Body() body: SuppliersRequestDto, @RequestId() requestId: string) {
    const suppliers = await this.catalog.activeSuppliers(body.suppliers);
    return toSuppliersResponse(requestId, paginate(suppliers, body.maximum_results, body.page));
  }

  @Post('constants')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'public, max-age=86400')
  async constantsList(@Body() body: CarConstantsRequestDto, @RequestId() requestId: string) {
    return { request_id: requestId, data: await this.constants.get(body.constants, body.languages) };
  }
}

function toLocationQuery(location: { airport?: string; city_id?: number; coordinates?: { latitude: number; longitude: number } }) {
  return { airport: location.airport, cityId: location.city_id, coordinates: location.coordinates };
}
