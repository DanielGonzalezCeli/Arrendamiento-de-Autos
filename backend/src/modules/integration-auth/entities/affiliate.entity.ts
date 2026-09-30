import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';

/**
 * Afiliado identificado por el header X-Affiliate-Id. Base para comisiones y límites por afiliado.
 * En RDA1 (modo lenient) se acepta cualquier entero; en modo strict debe existir aquí y estar activo.
 */
@Entity('affiliates')
export class Affiliate {
  @PrimaryColumn({ type: 'integer' })
  id: number;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'numeric', precision: 5, scale: 4, default: 0, transformer: new ColumnNumericTransformer() })
  commissionRate: number;

  @Column({ type: 'integer', default: 120 })
  rateLimitPerMin: number;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
