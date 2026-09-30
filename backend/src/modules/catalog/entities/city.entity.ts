import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

/** city_id del LocationPoint del contrato (integer). */
@Entity('cities')
@Unique(['name', 'countryCode'])
export class City {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'BY DEFAULT' })
  id: number;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  /** ISO 3166-1 alfa-2 en minúsculas, igual que Booker.country del contrato. */
  @Column({ type: 'char', length: 2 })
  countryCode: string;
}
