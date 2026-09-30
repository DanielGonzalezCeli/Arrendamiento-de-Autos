import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Depot } from './depot.entity';

/** Horario semanal de una agencia (weekday 0 = domingo … 6 = sábado), en la zona horaria de la agencia. */
@Entity('depot_opening_hours')
@Check(`"weekday" BETWEEN 0 AND 6`)
@Check(`"opens" < "closes"`)
export class DepotOpeningHours {
  @PrimaryColumn()
  depotId: number;

  @PrimaryColumn({ type: 'smallint' })
  weekday: number;

  @ManyToOne(() => Depot, (depot) => depot.openingHours, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'depot_id' })
  depot: Depot;

  /** Formato HH:MM:SS. */
  @Column({ type: 'time' })
  opens: string;

  @Column({ type: 'time' })
  closes: string;
}
