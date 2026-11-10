import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type ClientSource = 'BOOKING' | 'WEB' | 'MOSTRADOR';

/** Conductor único entre plataformas (contrato v3.1): identificación y correo canónico no se repiten. Tabla clientes.clients. */
@Entity('clients')
export class Client {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  fullName!: string;

  @Column({ type: 'varchar', length: 120 })
  email!: string;

  @Column({ type: 'varchar', length: 120, unique: true })
  emailCanonical!: string;

  @Column({ type: 'varchar', length: 20, unique: true })
  identification!: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  licenseNumber!: string | null;

  @Column({ type: 'varchar', length: 20 })
  source!: ClientSource;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
