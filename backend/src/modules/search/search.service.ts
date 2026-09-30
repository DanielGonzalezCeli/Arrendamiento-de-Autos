import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BUSINESS_RULES, MINUTE_MS } from '../../domain/business-rules';
import { isDepotOpenAt, localDate } from '../../domain/depot-schedule';
import { LocationQuery, resolveDepots } from '../../domain/depot-locator';
import { DomainError } from '../../domain/domain-error';
import { isDriverAgeAllowed } from '../../domain/driver-eligibility';
import { OrderChannel } from '../../domain/enums';
import { calculatePrice, PriceBreakdown } from '../../domain/pricing';
import { billableDays, validateRentalWindow } from '../../domain/rental-period';
import { AvailabilityService } from '../availability/availability.service';
import { CatalogService } from '../catalog/catalog.service';
import { Depot } from '../catalog/entities/depot.entity';
import { Rate } from '../catalog/entities/rate.entity';
import { VehicleModel } from '../catalog/entities/vehicle-model.entity';
import { QuotedResult, SearchSession } from '../orders/entities/search-session.entity';

/** Criterios de búsqueda independientes del canal (web o Booking Hub). */
export interface SearchCriteria {
  channel: OrderChannel;
  ownerSub?: string | null;
  affiliateId?: number | null;
  pickupAt: Date;
  dropoffAt: Date;
  pickupLocation: LocationQuery;
  dropoffLocation: LocationQuery;
  driverAge: number;
  bookerCountry: string;
  currency: string;
  carTypes?: string[];
  transmissions?: string[];
  /** Request original, para auditoría. */
  request: Record<string, unknown>;
}

export interface SearchOffer {
  vehicleModel: VehicleModel;
  pickupDepot: Depot;
  dropoffDepot: Depot;
  price: PriceBreakdown;
  availableUnits: number;
}

export interface SearchOutcome {
  session: SearchSession;
  offers: SearchOffer[];
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Motor de búsqueda (Fase 7). Devuelve una oferta por modelo (vehicle_id) disponible, con su precio,
 * y guarda el contexto como sesión: su id es el search_token que usarán hold y preview.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly catalog: CatalogService,
    private readonly availability: AvailabilityService,
    @InjectRepository(SearchSession) private readonly sessions: Repository<SearchSession>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async search(criteria: SearchCriteria, now = new Date()): Promise<SearchOutcome> {
    validateRentalWindow(criteria.pickupAt, criteria.dropoffAt, now);
    const rateFromUsd = await this.catalog.rateFromUsd(criteria.currency);

    const depots = await this.catalog.activeDepots();
    // Agencias cerradas a la hora pedida simplemente no ofrecen resultados (RN05).
    const pickupDepots = resolveDepots(depots, criteria.pickupLocation, 'route.pickup.location').filter((d) =>
      isDepotOpenAt(d.openingHours, d.timezone, criteria.pickupAt),
    );
    const dropoffDepots = resolveDepots(depots, criteria.dropoffLocation, 'route.dropoff.location').filter((d) =>
      isDepotOpenAt(d.openingHours, d.timezone, criteria.dropoffAt),
    );

    const days = billableDays(criteria.pickupAt, criteria.dropoffAt);
    const models = this.filterModels(await this.catalog.publishedModels(), criteria);
    const rateCache = new Map<string, Rate | null>();
    const offers: SearchOffer[] = [];

    for (const model of models) {
      // RN06: la edad mínima de la categoría excluye el modelo (no es un error en la búsqueda).
      if (!isDriverAgeAllowed(criteria.driverAge, model.category.minDriverAge)) continue;

      for (const pickupDepot of pickupDepots.filter((d) => d.supplierId === model.supplierId)) {
        const dropoffDepot = this.chooseDropoff(pickupDepot, dropoffDepots);
        if (!dropoffDepot) continue;

        const rate = await this.rateFor(model, pickupDepot, criteria.pickupAt, rateCache);
        if (!rate) continue;

        const availableUnits = await this.availability.countAvailableUnits(this.dataSource.manager, {
          vehicleModelId: model.id,
          depotId: pickupDepot.id,
          pickupAt: criteria.pickupAt,
          dropoffAt: criteria.dropoffAt,
        });
        if (availableUnits === 0) continue;

        const price = calculatePrice({
          dailyRateUsd: rate.dailyRate,
          days,
          driverAge: criteria.driverAge,
          oneWay: dropoffDepot.id !== pickupDepot.id,
          extras: [],
          currency: criteria.currency,
          rateFromUsd,
        });
        offers.push({ vehicleModel: model, pickupDepot, dropoffDepot, price, availableUnits });
        break; // una oferta por vehicle_id: la primera agencia (en orden de preferencia) con stock
      }
    }

    offers.sort((a, b) => a.price.total - b.price.total);
    const session = await this.saveSession(criteria, pickupDepots, dropoffDepots, offers, now);
    return { session, offers };
  }

  /** Recupera una sesión vigente (hold, preview, paginación). */
  async getActiveSession(searchToken: string, now = new Date()): Promise<SearchSession> {
    const session = UUID_PATTERN.test(searchToken) ? await this.sessions.findOne({ where: { id: searchToken } }) : null;
    if (!session || session.expiresAt <= now) {
      throw DomainError.validation('El search_token no existe o expiró; realiza una nueva búsqueda', [
        { name: 'search_token', reason: 'inexistente o expirado' },
      ]);
    }
    return session;
  }

  /** Oferta cotizada de un vehículo dentro de una sesión (404 si el vehicle_id no estaba en los resultados). */
  findQuotedResult(session: SearchSession, vehicleId: string): QuotedResult {
    const result = session.results.find((r) => r.vehicleModelId === vehicleId);
    if (!result) throw DomainError.notFound(`El vehicle_id ${vehicleId} no forma parte de esta búsqueda`);
    return result;
  }

  private filterModels(models: VehicleModel[], criteria: SearchCriteria): VehicleModel[] {
    const carTypes = criteria.carTypes?.length ? new Set(criteria.carTypes.map((t) => t.toUpperCase())) : null;
    const transmissions = criteria.transmissions?.length ? new Set(criteria.transmissions.map((t) => t.toUpperCase())) : null;
    return models.filter(
      (m) => (!carTypes || carTypes.has(m.category.code)) && (!transmissions || transmissions.has(m.transmission)),
    );
  }

  /** RN11: misma agencia si es posible; si no, otra del mismo proveedor (one-way). */
  private chooseDropoff(pickupDepot: Depot, dropoffDepots: Depot[]): Depot | undefined {
    return (
      dropoffDepots.find((d) => d.id === pickupDepot.id) ??
      dropoffDepots.find((d) => d.supplierId === pickupDepot.supplierId)
    );
  }

  private async rateFor(model: VehicleModel, depot: Depot, pickupAt: Date, cache: Map<string, Rate | null>) {
    const date = localDate(pickupAt, depot.timezone);
    const key = `${model.supplierId}|${model.categoryId}|${date}`;
    if (!cache.has(key)) cache.set(key, await this.catalog.findRate(model.supplierId, model.categoryId, date));
    return cache.get(key) ?? null;
  }

  private saveSession(
    criteria: SearchCriteria, pickupDepots: Depot[], dropoffDepots: Depot[], offers: SearchOffer[], now: Date,
  ): Promise<SearchSession> {
    return this.sessions.save(
      this.sessions.create({
        channel: criteria.channel,
        ownerSub: criteria.ownerSub ?? null,
        affiliateId: criteria.affiliateId ?? null,
        pickupAt: criteria.pickupAt,
        dropoffAt: criteria.dropoffAt,
        pickupDepotIds: pickupDepots.map((d) => d.id),
        dropoffDepotIds: dropoffDepots.map((d) => d.id),
        driverAge: criteria.driverAge,
        bookerCountry: criteria.bookerCountry,
        currency: criteria.currency,
        request: criteria.request,
        results: offers.map((o) => ({
          vehicleModelId: o.vehicleModel.id,
          supplierId: o.vehicleModel.supplierId,
          pickupDepotId: o.pickupDepot.id,
          dropoffDepotId: o.dropoffDepot.id,
          totalPrice: o.price.total,
        })),
        expiresAt: new Date(now.getTime() + BUSINESS_RULES.SEARCH_TTL_MINUTES * MINUTE_MS),
      }),
    );
  }
}
