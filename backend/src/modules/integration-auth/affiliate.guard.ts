import { CanActivate, createParamDecorator, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DomainError } from '../../domain/domain-error';
import { Affiliate } from './entities/affiliate.entity';

export type AffiliateValidationMode = 'lenient' | 'strict';

const POSITIVE_INTEGER = /^[1-9]\d{0,9}$/;

/**
 * Header X-Affiliate-Id (integer, requerido en los endpoints de catálogo del contrato).
 * - lenient (RDA1, confirmado por el equipo de integración): cualquier entero positivo.
 * - strict (producción): el afiliado debe existir en `affiliates` y estar activo.
 * El id queda en request.affiliateId para el rate limit y para asociar comisiones a las reservas.
 */
@Injectable()
export class AffiliateGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Affiliate) private readonly affiliates: Repository<Affiliate>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const raw = request.headers['x-affiliate-id'];

    if (typeof raw !== 'string' || !POSITIVE_INTEGER.test(raw.trim())) {
      throw DomainError.validation('El header X-Affiliate-Id es obligatorio y debe ser un entero positivo', [
        { name: 'X-Affiliate-Id', reason: raw === undefined ? 'requerido' : 'debe ser integer' },
      ]);
    }
    const affiliateId = Number(raw.trim());

    if (this.config.get<AffiliateValidationMode>('AFFILIATE_VALIDATION') === 'strict') {
      const affiliate = await this.affiliates.findOne({ where: { id: affiliateId, active: true } });
      if (!affiliate) {
        throw DomainError.validation('Afiliado desconocido o inactivo', [{ name: 'X-Affiliate-Id', reason: 'no registrado' }]);
      }
    }

    request.affiliateId = affiliateId;
    return true;
  }
}

export const AffiliateId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): number => context.switchToHttp().getRequest().affiliateId,
);
