import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { v3Error, V3Code } from '../../common/problem-details/problem-details-v3';
import { BUSINESS_RULES } from '../../domain/business-rules';
import { VehicleState } from '../../domain/fleet-state';
import { zonedToUtc } from '../../domain/zoned-time';
import { occupiedPeriodSql } from '../availability/availability.service';
import { FleetStatusService, FleetUnitView } from '../fleet-status/fleet-status.service';
import { StockSyncService } from '../stock-sync/stock-sync.service';
import { photoResolver, PhotoUrlResolver, toVehicleCard, v3Category, v3Transmission } from './v3-mapper';

export interface CatalogQuery {
  category?: string;
  transmission?: string;
  limit?: string;
}

const DEFAULT_LIMIT = 10;
const DAY_MS = 24 * 3_600_000;
const MAX_LIMIT = 100;
const CATEGORIES = ['ALL', 'ECONOMICO', 'COMPACTO', 'SUV', 'PREMIUM', 'VAN'];
const TRANSMISSIONS = ['ALL', 'MANUAL', 'AUTOMATICO'];

interface Filters {
  category: string;
  transmission: string;
  limit: number;
}

function parseFilters(query: CatalogQuery): Filters {
  const category = (query.category ?? 'ALL').toUpperCase();
  const transmission = (query.transmission ?? 'ALL').toUpperCase();
  const limit = query.limit === undefined ? DEFAULT_LIMIT : Number(query.limit);
  const invalid = [
    ...(!CATEGORIES.includes(category) ? [{ name: 'category', reason: `valores: ${CATEGORIES.join(', ')}` }] : []),
    ...(!TRANSMISSIONS.includes(transmission) ? [{ name: 'transmission', reason: `valores: ${TRANSMISSIONS.join(', ')}` }] : []),
    ...(!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT ? [{ name: 'limit', reason: `entero de 1 a ${MAX_LIMIT}` }] : []),
  ];
  if (invalid.length) throw v3Error(400, V3Code.MalformedRequest, 'Parámetros inválidos', 'Revisa los filtros del catálogo', invalid);
  return { category, transmission, limit };
}

/** Vendible (con tarifa vigente) y dentro de los filtros. */
function matches(unit: FleetUnitView, { category, transmission }: Filters): boolean {
  return unit.dailyRateUsd !== null
    && (category === 'ALL' || v3Category(unit.model.category.code) === category)
    && (transmission === 'ALL' || v3Transmission(unit.model.transmission) === transmission);
}

const isIsoDate = (value: string | undefined): value is string =>
  !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && zonedToUtc(value, '00:00', 'UTC') !== null;

/** "Quito", "quito", "QUITO " y "Quitó" valen lo mismo. */
const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();

/** Catálogo de autos concretos (GET /autos, GET /autos/{id}) y semáforo de salud (GET /health). */
@Injectable()
export class V3CatalogService {
  private readonly photoUrl: PhotoUrlResolver;

  constructor(
    private readonly config: ConfigService,
    private readonly fleet: FleetStatusService,
    private readonly stockSync: StockSyncService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {
    const webUrl = config.get<string>('PUBLIC_WEB_URL') ?? config.get<string>('CORS_ORIGINS')?.split(',')[0]?.trim();
    this.photoUrl = photoResolver(config.get<string>('PUBLIC_BASE_URL'), webUrl);
  }

  /**
   * GET /autos: solo autos DISPONIBLES (el contrato excluye RESERVADO, ENTREGADO, EN_MANTENIMIENTO y EN_LIMPIEZA).
   * Booking lo usa en el botón "Sincronizar" (acepta { data: [...] }).
   */
  async list(query: CatalogQuery) {
    const filters = parseFilters(query);
    const available = (await this.fleet.list()).filter((unit) => unit.state === VehicleState.Available && matches(unit, filters));
    return { total: available.length, limit: filters.limit, data: available.slice(0, filters.limit).map((unit) => toVehicleCard(unit, this.photoUrl)) };
  }

  /**
   * POST /autos/search (guía de socios de Booking): { ciudad, fecha_inicio, fecha_fin, categoria }, también en inglés.
   * Sin fechas: los autos disponibles ahora, como GET /autos. Con fechas: los autos libres en ese periodo (días
   * completos en la zona de la agencia, más el margen de limpieza), aunque hoy estén en limpieza o reservados para
   * otras fechas. Cada auto es una unidad: stock 1.
   */
  async search(body: unknown) {
    const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    const text = (...keys: string[]) => {
      const value = keys.map((k) => input[k]).find((v) => v !== undefined && v !== null && v !== '');
      return value === undefined ? undefined : String(value).trim();
    };
    const filters = parseFilters({
      category: text('categoria', 'category'),
      transmission: text('transmision', 'transmission'),
      limit: text('limit', 'limite') ?? String(MAX_LIMIT),
    });
    const city = text('ciudad', 'city');
    const from = text('fecha_inicio', 'pickup_date');
    const to = text('fecha_fin', 'dropoff_date');
    const dated = from !== undefined || to !== undefined;
    if (dated) {
      const invalid = [
        ...(!isIsoDate(from) ? [{ name: 'fecha_inicio', reason: 'formato YYYY-MM-DD' }] : []),
        ...(!isIsoDate(to) ? [{ name: 'fecha_fin', reason: 'formato YYYY-MM-DD' }] : []),
        ...(isIsoDate(from) && isIsoDate(to) && to < from ? [{ name: 'fecha_fin', reason: 'no puede ser anterior a fecha_inicio' }] : []),
      ];
      if (invalid.length) throw v3Error(422, V3Code.InvalidDates, 'Fechas inválidas', 'Revisa el periodo de la búsqueda', invalid);
    }

    let units = (await this.fleet.list()).filter((unit) =>
      matches(unit, filters) && (!city || normalize(unit.depot.city?.name ?? '') === normalize(city)));
    units = dated ? await this.freeBetween(units, from!, to!) : units.filter((unit) => unit.state === VehicleState.Available);
    return {
      total: units.length,
      limit: filters.limit,
      data: units.slice(0, filters.limit).map((unit) => ({ ...toVehicleCard(unit, this.photoUrl), stock: 1, unidades_disponibles: 1 })),
    };
  }

  /** Autos que no están en taller ni tienen bloqueo o reserva activa (RN26 incluida) que se cruce con el periodo. */
  private async freeBetween(units: FleetUnitView[], from: string, to: string): Promise<FleetUnitView[]> {
    if (!units.length) return units;
    const periods = units.map((unit) => {
      const start = zonedToUtc(from, '00:00', unit.depot.timezone)!;
      const end = new Date(zonedToUtc(to, '00:00', unit.depot.timezone)!.getTime() + DAY_MS);
      return [unit.unitId, start.toISOString(), end.toISOString()];
    });
    const busy: { id: string }[] = await this.dataSource.query(
      `WITH req AS (
         SELECT p.id::uuid AS id,
                tstzrange(p.start::timestamptz - make_interval(mins => $4), p.finish::timestamptz + make_interval(mins => $4), '[)') AS period
           FROM unnest($1::text[], $2::text[], $3::text[]) AS p(id, start, finish)
       )
       SELECT req.id FROM req JOIN fleet_units fu ON fu.id = req.id
        WHERE fu.status <> 'AVAILABLE'
           OR EXISTS (SELECT 1 FROM vehicle_blocks b WHERE b.fleet_unit_id = req.id AND b.period && req.period)
           OR EXISTS (SELECT 1 FROM reservations r
                       WHERE r.fleet_unit_id = req.id AND r.status IN ('PENDING', 'CONFIRMED') AND r.rental_status <> 'RETURNED'
                         AND ${occupiedPeriodSql('r')} && req.period)`,
      [periods.map((p) => p[0]), periods.map((p) => p[1]), periods.map((p) => p[2]), BUSINESS_RULES.CLEANING_BUFFER_MINUTES],
    );
    const busyIds = new Set(busy.map((row) => row.id));
    return units.filter((unit) => !busyIds.has(unit.unitId));
  }

  /** GET /autos/{id}: ficha del auto en cualquier estado (incluye el cronómetro de limpieza). */
  async get(vehicleId: string) {
    const unit = await this.fleet.findByVehicleId(vehicleId);
    if (!unit) throw v3Error(404, V3Code.NotFound, 'Vehículo no encontrado', `El vehículo ${vehicleId} no existe en la flota`);
    return toVehicleCard(unit, this.photoUrl);
  }

  /** Semáforo del panel de nodos de Booking: debe responder en menos de 4 s. */
  async health() {
    const started = Date.now();
    let row: { total: string; cooldown: string };
    try {
      [row] = await this.dataSource.query(
        `SELECT (SELECT count(*) FROM fleet_units WHERE active) AS total,
                (SELECT count(DISTINCT r.fleet_unit_id) FROM reservation_history h JOIN reservations r ON r.id = h.reservation_id
                  WHERE h.action = 'RETURNED' AND h.created_at > now() - make_interval(mins => $1)) AS cooldown`,
        [BUSINESS_RULES.CLEANING_BUFFER_MINUTES],
      );
    } catch {
      throw v3Error(503, V3Code.ServiceUnavailable, 'Nodo de autos no disponible', 'La base de datos no responde');
    }
    return {
      status: 'HEALTHY',
      nodo_id: this.config.get<string>('NODE_ID'),
      nombre_proveedor: this.config.get<string>('PARTNER_NAME'),
      vertical: 'AUTOS',
      version: '3.0.0',
      uptime_seconds: Math.round(process.uptime()),
      latencia_ms: Date.now() - started,
      circuit_breaker_estado: 'CLOSED',
      cooldown_activo_count: Number(row.cooldown),
      total_vehiculos: Number(row.total),
      sincronizacion_stock: this.stockSync.enabled ? this.config.get<string>('STOCK_SYNC_MODE') : 'off',
      timestamp: new Date().toISOString(),
    };
  }
}
