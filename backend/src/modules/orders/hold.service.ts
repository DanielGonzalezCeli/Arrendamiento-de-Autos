import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, MoreThan } from 'typeorm';
import { BUSINESS_RULES, MINUTE_MS } from '../../domain/business-rules';
import { DomainError, ProblemCode } from '../../domain/domain-error';
import { assertDriverAgeAllowed } from '../../domain/driver-eligibility';
import { HoldStatus } from '../../domain/enums';
import { AvailabilityService } from '../availability/availability.service';
import { CatalogService } from '../catalog/catalog.service';
import { SearchService } from '../search/search.service';
import { Hold } from './entities/hold.entity';

export interface CreateHoldInput {
  searchToken: string;
  vehicleId: string;
  ownerSub: string;
  /** OrderHoldRequest.driver (opcional): si viene, se vuelve a validar la edad. */
  driverAge?: number;
}

/**
 * RN15 — bloqueo temporal (POST /orders/hold): reserva una unidad del inventario del modelo durante
 * HOLD_TTL_MINUTES al precio cotizado. Mientras está vigente, cuenta como ocupada para los demás.
 */
@Injectable()
export class HoldService {
  constructor(
    private readonly search: SearchService,
    private readonly catalog: CatalogService,
    private readonly availability: AvailabilityService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async create(input: CreateHoldInput, now = new Date()): Promise<Hold> {
    const session = await this.search.getActiveSession(input.searchToken, now);
    const quoted = this.search.findQuotedResult(session, input.vehicleId);
    const model = await this.catalog.findModel(input.vehicleId);
    if (!model) throw DomainError.notFound(`El vehicle_id ${input.vehicleId} no existe`);
    if (input.driverAge !== undefined) assertDriverAgeAllowed(input.driverAge, model.category.minDriverAge, model.category.name);

    return this.dataSource.transaction(async (manager) => {
      // No hay Idempotency-Key en hold: un reintento del mismo dueño devuelve el hold vigente.
      const existing = await manager.findOne(Hold, {
        where: {
          searchSessionId: session.id, vehicleModelId: model.id, ownerSub: input.ownerSub,
          status: HoldStatus.Held, expiresAt: MoreThan(now),
        },
      });
      if (existing) return existing;

      await this.availability.lockVehicleModel(manager, model.id);
      const units = await this.availability.countAvailableUnits(manager, {
        vehicleModelId: model.id, depotId: quoted.pickupDepotId, pickupAt: session.pickupAt, dropoffAt: session.dropoffAt,
      });
      if (units === 0) {
        throw DomainError.conflict(ProblemCode.CarNoLongerAvailable, 'Vehículo no disponible', 'Ya no quedan unidades de este modelo para esas fechas');
      }

      return manager.save(Hold, manager.create(Hold, {
        searchSessionId: session.id,
        vehicleModelId: model.id,
        pickupDepotId: quoted.pickupDepotId,
        dropoffDepotId: quoted.dropoffDepotId,
        ownerSub: input.ownerSub,
        pickupAt: session.pickupAt,
        dropoffAt: session.dropoffAt,
        quotedTotal: quoted.totalPrice,
        currency: session.currency,
        status: HoldStatus.Held,
        expiresAt: new Date(now.getTime() + BUSINESS_RULES.HOLD_TTL_MINUTES * MINUTE_MS),
      }));
    });
  }
}
