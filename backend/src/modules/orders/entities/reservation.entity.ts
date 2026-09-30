import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';
import { OrderChannel, OrderStatus, RentalStatus } from '../../../domain/enums';
import { PriceBreakdown } from '../../../domain/pricing';
import { Depot } from '../../catalog/entities/depot.entity';
import { VehicleModel } from '../../catalog/entities/vehicle-model.entity';
import { ReservationExtra } from './reservation-extra.entity';

/**
 * Reserva / orden (OrderDetail del contrato). Guarda snapshots del vehículo, la ruta y el precio
 * para conservar lo vendido aunque cambie el catálogo (RN20).
 */
@Entity('reservations')
@Index('idx_reservations_owner', ['ownerSub', 'createdAt'])
@Index('idx_reservations_inventory', ['vehicleModelId', 'pickupDepotId', 'status'])
@Index('idx_reservations_status_pickup', ['status', 'pickupAt'])
export class Reservation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Localizador tipo PNR (ej. ANDES-7K2Q9M). */
  @Column({ type: 'varchar', length: 20, unique: true })
  locator: string;

  @Column({ type: 'enum', enum: OrderStatus, enumName: 'order_status', default: OrderStatus.Confirmed })
  status: OrderStatus;

  @Column({ type: 'enum', enum: RentalStatus, enumName: 'rental_status', default: RentalStatus.NotStarted })
  rentalStatus: RentalStatus;

  @Column({ type: 'enum', enum: OrderChannel, enumName: 'order_channel' })
  channel: OrderChannel;

  /** Dueño = claim sub del token (contrato). Web: "user:<uuid>". */
  @Column({ type: 'varchar', length: 200 })
  ownerSub: string;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ type: 'integer', nullable: true })
  affiliateId: number | null;

  @Column({ type: 'uuid' })
  vehicleModelId: string;

  @ManyToOne(() => VehicleModel)
  @JoinColumn({ name: 'vehicle_model_id' })
  vehicleModel: VehicleModel;

  /** Placa asignada al entregar el vehículo (null hasta entonces). */
  @Column({ type: 'uuid', nullable: true })
  fleetUnitId: string | null;

  @Column()
  pickupDepotId: number;

  @ManyToOne(() => Depot)
  @JoinColumn({ name: 'pickup_depot_id' })
  pickupDepot: Depot;

  @Column()
  dropoffDepotId: number;

  @ManyToOne(() => Depot)
  @JoinColumn({ name: 'dropoff_depot_id' })
  dropoffDepot: Depot;

  @Column({ type: 'timestamptz' })
  pickupAt: Date;

  @Column({ type: 'timestamptz' })
  dropoffAt: Date;

  @Column({ type: 'varchar', length: 60 })
  driverFirstName: string;

  @Column({ type: 'varchar', length: 60 })
  driverLastName: string;

  @Column({ type: 'varchar', length: 120 })
  driverEmail: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  driverPhone: string | null;

  @Column({ type: 'smallint' })
  driverAge: number;

  @Column({ type: 'char', length: 2 })
  bookerCountry: string;

  @Column({ type: 'jsonb' })
  vehicleSnapshot: Record<string, unknown>;

  @Column({ type: 'jsonb' })
  routeSnapshot: Record<string, unknown>;

  @Column({ type: 'jsonb' })
  priceBreakdown: PriceBreakdown;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: new ColumnNumericTransformer() })
  totalPrice: number;

  @Column({ type: 'char', length: 3 })
  currency: string;

  @Column({ type: 'varchar', length: 64 })
  paymentReference: string;

  @Column({ type: 'uuid', nullable: true, unique: true })
  orderPreviewId: string | null;

  @Column({ type: 'uuid', nullable: true })
  holdId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true, transformer: new ColumnNumericTransformer() })
  cancellationFee: number | null;

  @OneToMany(() => ReservationExtra, (extra) => extra.reservation, { cascade: ['insert'] })
  extras: ReservationExtra[];

  /** Bloqueo optimista: detecta modificaciones concurrentes. */
  @VersionColumn()
  version: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
