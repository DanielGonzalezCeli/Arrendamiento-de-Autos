import { Injectable } from '@nestjs/common';
import { assertDepotOpen, localDate } from '../../domain/depot-schedule';
import { DomainError, ProblemCode } from '../../domain/domain-error';
import { assertDriverAgeAllowed } from '../../domain/driver-eligibility';
import { calculatePrice, PriceBreakdown } from '../../domain/pricing';
import { billableDays } from '../../domain/rental-period';
import { CatalogService } from '../catalog/catalog.service';
import { Depot } from '../catalog/entities/depot.entity';
import { Extra } from '../catalog/entities/extra.entity';
import { VehicleModel } from '../catalog/entities/vehicle-model.entity';

export interface QuoteInput {
  model: VehicleModel;
  pickupDepot: Depot;
  dropoffDepot: Depot;
  pickupAt: Date;
  dropoffAt: Date;
  driverAge: number;
  currency: string;
  extraCodes: string[];
  /** Nombre del campo de extras en la API que llama (para invalidParams). */
  extrasField?: string;
}

export interface Quote {
  breakdown: PriceBreakdown;
  extras: Extra[];
  days: number;
}

/**
 * Cotización de una orden concreta (preview, creación con preview expirada, modificación).
 * Reúne las reglas que dependen del catálogo: tarifa vigente, extras válidos, horario y edad.
 */
@Injectable()
export class OrderPricingService {
  constructor(private readonly catalog: CatalogService) {}

  /** RN05 + RN06: agencias abiertas y edad permitida para la categoría. */
  assertBookable(input: Pick<QuoteInput, 'model' | 'pickupDepot' | 'dropoffDepot' | 'pickupAt' | 'dropoffAt' | 'driverAge'>): void {
    assertDriverAgeAllowed(input.driverAge, input.model.category.minDriverAge, input.model.category.name);
    assertDepotOpen(input.pickupDepot.openingHours, input.pickupDepot.timezone, input.pickupAt, input.pickupDepot.name, 'recogida');
    assertDepotOpen(input.dropoffDepot.openingHours, input.dropoffDepot.timezone, input.dropoffAt, input.dropoffDepot.name, 'devolución');
  }

  async quote(input: QuoteInput): Promise<Quote> {
    const date = localDate(input.pickupAt, input.pickupDepot.timezone);
    const rate = await this.catalog.findRate(input.model.supplierId, input.model.categoryId, date);
    if (!rate) {
      throw DomainError.conflict(ProblemCode.CarNoLongerAvailable, 'Vehículo no disponible', 'No hay tarifa vigente para esas fechas');
    }

    const codes = [...new Set(input.extraCodes.map((c) => c.trim().toUpperCase()))];
    const extras = codes.length ? await this.catalog.activeExtras(codes) : [];
    const unknown = codes.filter((code) => !extras.some((e) => e.code === code));
    if (unknown.length) {
      throw DomainError.validation(`Extras desconocidos: ${unknown.join(', ')}`, [
        { name: input.extrasField ?? 'extras', reason: `no existen: ${unknown.join(', ')}` },
      ]);
    }

    const days = billableDays(input.pickupAt, input.dropoffAt);
    const breakdown = calculatePrice({
      dailyRateUsd: rate.dailyRate,
      days,
      driverAge: input.driverAge,
      oneWay: input.pickupDepot.id !== input.dropoffDepot.id,
      extras: extras.map((e) => ({ code: e.code, name: e.name, pricePerDayUsd: e.pricePerDay, maxPriceUsd: e.maxPrice })),
      currency: input.currency,
      rateFromUsd: await this.catalog.rateFromUsd(input.currency),
    });
    return { breakdown, extras, days };
  }
}
