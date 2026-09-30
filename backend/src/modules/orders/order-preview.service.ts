import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BUSINESS_RULES, MINUTE_MS } from '../../domain/business-rules';
import { DomainError, ProblemCode } from '../../domain/domain-error';
import { HoldStatus } from '../../domain/enums';
import { AvailabilityService } from '../availability/availability.service';
import { CatalogService } from '../catalog/catalog.service';
import { SearchService } from '../search/search.service';
import { Hold } from './entities/hold.entity';
import { OrderPreview } from './entities/order-preview.entity';
import { OrderPricingService } from './order-pricing.service';
import { isUuid } from './uuid';

export interface CreatePreviewInput {
  searchToken: string;
  vehicleId: string;
  holdId?: string;
  extras: string[];
  ownerSub: string;
  extrasField?: string;
}

/**
 * RN16 — preview (POST /orders/preview): calcula el precio final con extras y lo congela.
 * Vale PREVIEW_TTL_MINUTES, o lo que le quede al hold si se hizo uno.
 */
@Injectable()
export class OrderPreviewService {
  constructor(
    private readonly search: SearchService,
    private readonly catalog: CatalogService,
    private readonly availability: AvailabilityService,
    private readonly pricing: OrderPricingService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async create(input: CreatePreviewInput, now = new Date()): Promise<OrderPreview> {
    const session = await this.search.getActiveSession(input.searchToken, now);
    const quoted = this.search.findQuotedResult(session, input.vehicleId);
    const [model, pickupDepot, dropoffDepot] = await Promise.all([
      this.catalog.findModel(input.vehicleId),
      this.catalog.findDepot(quoted.pickupDepotId),
      this.catalog.findDepot(quoted.dropoffDepotId),
    ]);
    if (!model || !pickupDepot || !dropoffDepot) {
      throw DomainError.conflict(ProblemCode.CarNoLongerAvailable, 'Vehículo no disponible', 'El vehículo o la agencia ya no están activos');
    }

    const hold = input.holdId ? await this.validHold(input, session.id, now) : null;
    const base = { model, pickupDepot, dropoffDepot, pickupAt: session.pickupAt, dropoffAt: session.dropoffAt, driverAge: session.driverAge };
    this.pricing.assertBookable(base);

    const units = await this.availability.countAvailableUnits(this.dataSource.manager, {
      vehicleModelId: model.id, depotId: pickupDepot.id, pickupAt: session.pickupAt, dropoffAt: session.dropoffAt, excludeHoldId: hold?.id,
    });
    if (units === 0) {
      throw DomainError.conflict(ProblemCode.CarNoLongerAvailable, 'Vehículo no disponible', 'Ya no quedan unidades de este modelo para esas fechas');
    }

    const quote = await this.pricing.quote({ ...base, currency: session.currency, extraCodes: input.extras, extrasField: input.extrasField });
    const previewTtl = new Date(now.getTime() + BUSINESS_RULES.PREVIEW_TTL_MINUTES * MINUTE_MS);

    return this.dataSource.getRepository(OrderPreview).save({
      searchSessionId: session.id,
      holdId: hold?.id ?? null,
      vehicleModelId: model.id,
      pickupDepotId: pickupDepot.id,
      dropoffDepotId: dropoffDepot.id,
      ownerSub: input.ownerSub,
      extras: quote.extras.map((e) => e.code),
      breakdown: quote.breakdown,
      totalPrice: quote.breakdown.total,
      currency: quote.breakdown.currency,
      expiresAt: hold ? hold.expiresAt : previewTtl,
    });
  }

  /** El hold debe ser del mismo dueño, búsqueda y vehículo, y estar vigente. */
  private async validHold(input: CreatePreviewInput, sessionId: string, now: Date): Promise<Hold> {
    const hold = isUuid(input.holdId!) ? await this.dataSource.getRepository(Hold).findOne({ where: { id: input.holdId } }) : null;
    if (!hold || hold.ownerSub !== input.ownerSub || hold.searchSessionId !== sessionId || hold.vehicleModelId !== input.vehicleId) {
      throw DomainError.validation('El hold_id no corresponde a esta búsqueda y vehículo', [{ name: 'hold_id', reason: 'inválido' }]);
    }
    if (hold.status !== HoldStatus.Held || hold.expiresAt <= now) {
      throw DomainError.conflict(ProblemCode.CarNoLongerAvailable, 'Hold expirado', 'El bloqueo expiró; vuelve a bloquear el vehículo');
    }
    return hold;
  }
}
