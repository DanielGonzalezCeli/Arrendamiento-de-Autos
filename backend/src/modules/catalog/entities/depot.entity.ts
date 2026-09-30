import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';
import { City } from './city.entity';
import { DepotOpeningHours } from './depot-opening-hours.entity';
import { Supplier } from './supplier.entity';

/** Agencia de recogida/devolución (depot_id integer en el contrato). */
@Entity('depots')
@Index('idx_depots_airport', ['airportCode'])
@Index('idx_depots_city', ['cityId'])
@Index('idx_depots_updated', ['updatedAt'])
export class Depot {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'BY DEFAULT' })
  id: number;

  @Column()
  supplierId: number;

  @ManyToOne(() => Supplier)
  @JoinColumn({ name: 'supplier_id' })
  supplier: Supplier;

  @Column()
  cityId: number;

  @ManyToOne(() => City)
  @JoinColumn({ name: 'city_id' })
  city: City;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 200 })
  address: string;

  /** Código IATA si la agencia está en un aeropuerto (LocationPoint.airport). */
  @Column({ type: 'char', length: 3, nullable: true })
  airportCode: string | null;

  @Column({ type: 'numeric', precision: 9, scale: 6, transformer: new ColumnNumericTransformer() })
  latitude: number;

  @Column({ type: 'numeric', precision: 9, scale: 6, transformer: new ColumnNumericTransformer() })
  longitude: number;

  @Column({ type: 'varchar', length: 50, default: 'America/Guayaquil' })
  timezone: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  services: string[];

  @Column({ default: true })
  active: boolean;

  @OneToMany(() => DepotOpeningHours, (hours) => hours.depot)
  openingHours: DepotOpeningHours[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
