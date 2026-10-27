import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v3Error, V3Code } from '../../common/problem-details/problem-details-v3';
import { InvalidParam } from '../../domain/domain-error';
import { PromotionAgreement } from './entities/promotion-agreement.entity';

const MAX_DESTINATIONS = 30;

/** Convenio B2B de promociones y combos con Booking (GET/PUT /autos/promociones/contrato · Cátedra RDA2 §9). */
@Injectable()
export class PromotionsService {
  constructor(
    private readonly config: ConfigService,
    @InjectRepository(PromotionAgreement) private readonly repository: Repository<PromotionAgreement>,
  ) {}

  async get() {
    return this.toResponse(await this.load());
  }

  async update(raw: unknown, actor: string) {
    const body = (typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
    const invalid: InvalidParam[] = [];
    const allows = body.permite_promociones;
    const percent = body.porcentaje_descuento_maximo;
    const destinations = body.destinos_habilitados ?? [];
    const validUntil = body.vigencia_hasta ?? null;
    const conditions = body.condiciones_combo ?? null;

    if (typeof allows !== 'boolean') invalid.push({ name: 'permite_promociones', reason: 'booleano obligatorio' });
    if (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0 || percent > 100) {
      invalid.push({ name: 'porcentaje_descuento_maximo', reason: 'número de 0 a 100 obligatorio' });
    }
    if (!Array.isArray(destinations) || destinations.length > MAX_DESTINATIONS
      || destinations.some((d) => typeof d !== 'string' || !d.trim() || d.length > 60)) {
      invalid.push({ name: 'destinos_habilitados', reason: `lista de hasta ${MAX_DESTINATIONS} ciudades` });
    }
    if (validUntil !== null && (typeof validUntil !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(validUntil) || Number.isNaN(Date.parse(validUntil)))) {
      invalid.push({ name: 'vigencia_hasta', reason: 'fecha YYYY-MM-DD' });
    }
    if (conditions !== null && (typeof conditions !== 'string' || conditions.length > 500)) {
      invalid.push({ name: 'condiciones_combo', reason: 'texto de hasta 500 caracteres' });
    }
    if (invalid.length) throw v3Error(400, V3Code.MalformedRequest, 'Acuerdo inválido', 'Revisa los campos del acuerdo de promociones', invalid);

    await this.repository.save({
      id: 1,
      allowsPromotions: allows as boolean,
      maxDiscountPercent: Math.round((percent as number) * 100) / 100,
      enabledDestinations: [...new Set((destinations as string[]).map((d) => d.trim()))],
      validUntil: validUntil as string | null,
      comboConditions: (conditions as string | null)?.trim() || null,
      updatedBy: actor,
    });
    return {
      success: true,
      mensaje: 'Acuerdo B2B de promociones y combos actualizado exitosamente.',
      contrato: this.toResponse(await this.load()),
    };
  }

  private async load(): Promise<PromotionAgreement> {
    return (await this.repository.findOne({ where: { id: 1 } }))
      ?? this.repository.create({ id: 1, allowsPromotions: false, maxDiscountPercent: 0, enabledDestinations: [], validUntil: null, comboConditions: null });
  }

  private toResponse(agreement: PromotionAgreement) {
    return {
      proveedor_codigo: this.config.get<string>('NODE_ID'),
      nombre_socio: this.config.get<string>('PARTNER_NAME'),
      vertical: 'AUTOS',
      permite_promociones: agreement.allowsPromotions,
      porcentaje_descuento_maximo: agreement.maxDiscountPercent,
      destinos_habilitados: agreement.enabledDestinations,
      vigencia_hasta: agreement.validUntil,
      condiciones_combo: agreement.comboConditions,
      actualizado_en: agreement.updatedAt?.toISOString() ?? null,
    };
  }
}
