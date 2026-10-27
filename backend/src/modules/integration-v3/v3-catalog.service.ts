import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { v3Error, V3Code } from '../../common/problem-details/problem-details-v3';
import { BUSINESS_RULES } from '../../domain/business-rules';
import { VehicleState } from '../../domain/fleet-state';
import { FleetStatusService } from '../fleet-status/fleet-status.service';
import { StockSyncService } from '../stock-sync/stock-sync.service';
import { photoResolver, PhotoUrlResolver, toVehicleCard, v3Category, v3Transmission } from './v3-mapper';

export interface CatalogQuery {
  category?: string;
  transmission?: string;
  limit?: string;
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const CATEGORIES = ['ALL', 'ECONOMICO', 'COMPACTO', 'SUV', 'PREMIUM', 'VAN'];
const TRANSMISSIONS = ['ALL', 'MANUAL', 'AUTOMATICO'];

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
    const category = (query.category ?? 'ALL').toUpperCase();
    const transmission = (query.transmission ?? 'ALL').toUpperCase();
    const limit = query.limit === undefined ? DEFAULT_LIMIT : Number(query.limit);
    const invalid = [
      ...(!CATEGORIES.includes(category) ? [{ name: 'category', reason: `valores: ${CATEGORIES.join(', ')}` }] : []),
      ...(!TRANSMISSIONS.includes(transmission) ? [{ name: 'transmission', reason: `valores: ${TRANSMISSIONS.join(', ')}` }] : []),
      ...(!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT ? [{ name: 'limit', reason: `entero de 1 a ${MAX_LIMIT}` }] : []),
    ];
    if (invalid.length) throw v3Error(400, V3Code.MalformedRequest, 'Parámetros inválidos', 'Revisa los filtros del catálogo', invalid);

    const available = (await this.fleet.list()).filter((unit) =>
      unit.state === VehicleState.Available
      && unit.dailyRateUsd !== null
      && (category === 'ALL' || v3Category(unit.model.category.code) === category)
      && (transmission === 'ALL' || v3Transmission(unit.model.transmission) === transmission));
    return {
      total: available.length,
      limit,
      data: available.slice(0, limit).map((unit) => toVehicleCard(unit, this.photoUrl)),
    };
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
