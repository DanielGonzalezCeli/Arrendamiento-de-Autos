import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { localDate } from '../../domain/depot-schedule';
import { UnitStatus } from '../../domain/enums';
import { unitState, UnitStateResult } from '../../domain/fleet-state';
import { CatalogService } from '../catalog/catalog.service';
import { Depot } from '../catalog/entities/depot.entity';
import { VehicleModel } from '../catalog/entities/vehicle-model.entity';

/** vehicle_id del contrato v3 = un auto concreto. Se deriva de la placa: PAN-1001 ↔ auto-pan-1001. */
export function vehicleIdForPlate(plate: string): string {
  return `auto-${plate.toLowerCase()}`;
}

export function plateFromVehicleId(vehicleId: string): string | null {
  const match = /^auto-([a-z]{3}-\d{3,4})$/i.exec(vehicleId.trim());
  return match ? match[1].toUpperCase() : null;
}

export interface FleetUnitView extends UnitStateResult {
  unitId: string;
  vehicleId: string;
  plate: string;
  year: number;
  color: string | null;
  mileage: number;
  model: VehicleModel;
  depot: Depot;
  /** Retiro de la próxima reserva asignada (para el PushStockUpdate de RESERVADO). */
  nextPickupAt: Date | null;
  /** Tarifa diaria vigente hoy (USD, sin impuestos); null si no hay tarifa. */
  dailyRateUsd: number | null;
}

interface UnitRow {
  id: string;
  plate: string;
  year: number;
  color: string | null;
  mileage: number;
  status: UnitStatus;
  vehicle_model_id: string;
  depot_id: number;
  blocked_now: boolean;
  picked_up: boolean;
  last_returned_at: Date | null;
  next_pickup_at: Date | null;
}

export interface FleetQuery {
  unitId?: string;
  plate?: string;
}

/**
 * Estado de cada auto concreto (placa) para el contrato v3 y la sincronización gRPC.
 * Solo incluye autos vendibles: unidad activa, modelo publicado y activo, agencia y proveedor activos.
 */
@Injectable()
export class FleetStatusService {
  constructor(
    private readonly catalog: CatalogService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async list(now = new Date(), query: FleetQuery = {}, manager: EntityManager = this.dataSource.manager): Promise<FleetUnitView[]> {
    const rows: UnitRow[] = await manager.query(
      `SELECT fu.id, fu.plate, fu.year, fu.color, fu.mileage, fu.status, fu.vehicle_model_id, fu.depot_id,
              EXISTS (SELECT 1 FROM vehicle_blocks b WHERE b.fleet_unit_id = fu.id AND b.period @> $1::timestamptz) AS blocked_now,
              EXISTS (SELECT 1 FROM reservations r
                       WHERE r.fleet_unit_id = fu.id AND r.status IN ('PENDING', 'CONFIRMED') AND r.rental_status = 'PICKED_UP') AS picked_up,
              (SELECT max(h.created_at) FROM reservation_history h JOIN reservations r ON r.id = h.reservation_id
                WHERE r.fleet_unit_id = fu.id AND h.action = 'RETURNED') AS last_returned_at,
              (SELECT min(r.pickup_at) FROM reservations r
                WHERE r.fleet_unit_id = fu.id AND r.status IN ('PENDING', 'CONFIRMED') AND r.rental_status = 'NOT_STARTED'
                  AND r.dropoff_at > $1::timestamptz) AS next_pickup_at
         FROM fleet_units fu
         JOIN vehicle_models vm ON vm.id = fu.vehicle_model_id AND vm.active AND vm.published
         JOIN depots d ON d.id = fu.depot_id AND d.active
         JOIN suppliers s ON s.id = vm.supplier_id AND s.active
        WHERE fu.active
          AND ($2::uuid IS NULL OR fu.id = $2::uuid)
          AND ($3::text IS NULL OR fu.plate = $3::text)
        ORDER BY vm.make, vm.model, fu.plate`,
      [now, query.unitId ?? null, query.plate ?? null],
    );
    if (!rows.length) return [];

    const [models, depots] = await Promise.all([
      manager.find(VehicleModel, { where: { id: In([...new Set(rows.map((r) => r.vehicle_model_id))]) }, relations: { category: true, supplier: true } }),
      manager.find(Depot, { where: { id: In([...new Set(rows.map((r) => r.depot_id))]) }, relations: { city: true, openingHours: true } }),
    ]);
    const modelById = new Map(models.map((m) => [m.id, m]));
    const depotById = new Map(depots.map((d) => [d.id, d]));
    const rates = new Map<string, Promise<number | null>>();
    const rateFor = (model: VehicleModel, depot: Depot) => {
      const date = localDate(now, depot.timezone);
      const key = `${model.supplierId}|${model.categoryId}|${date}`;
      if (!rates.has(key)) rates.set(key, this.catalog.findRate(model.supplierId, model.categoryId, date).then((r) => r?.dailyRate ?? null));
      return rates.get(key)!;
    };

    return Promise.all(rows.map(async (row) => {
      const model = modelById.get(row.vehicle_model_id)!;
      const depot = depotById.get(row.depot_id)!;
      const lastReturnedAt = row.last_returned_at ? new Date(row.last_returned_at) : null;
      const nextPickupAt = row.next_pickup_at ? new Date(row.next_pickup_at) : null;
      const state = unitState(
        { unitStatus: row.status, blockedNow: row.blocked_now, pickedUp: row.picked_up, lastReturnedAt, nextPickupAt }, now,
      );
      return {
        ...state,
        unitId: row.id,
        vehicleId: vehicleIdForPlate(row.plate),
        plate: row.plate,
        year: row.year,
        color: row.color,
        mileage: row.mileage,
        model,
        depot,
        nextPickupAt,
        dailyRateUsd: await rateFor(model, depot),
      };
    }));
  }

  async findByVehicleId(vehicleId: string, now = new Date(), manager?: EntityManager): Promise<FleetUnitView | null> {
    const plate = plateFromVehicleId(vehicleId);
    if (!plate) return null;
    const [unit] = await this.list(now, { plate }, manager);
    return unit ?? null;
  }
}
