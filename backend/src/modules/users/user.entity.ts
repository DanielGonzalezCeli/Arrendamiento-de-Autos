import { BeforeInsert, BeforeUpdate, Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { canonicalEmail } from '../../domain/contact-rules';
import { UserRole } from '../../domain/enums';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'citext', unique: true })
  email: string;

  /** Correo normalizado (en Gmail sin puntos ni "+etiqueta"); único: evita cuentas duplicadas del mismo buzón. */
  @Column({ type: 'varchar', length: 300, unique: true })
  emailCanonical: string;

  @BeforeInsert()
  @BeforeUpdate()
  syncEmailCanonical() {
    if (this.email) this.emailCanonical = canonicalEmail(this.email);
  }

  /** Nunca se serializa hacia el cliente (ver UserMapper). */
  @Column({ type: 'varchar', length: 100 })
  passwordHash: string;

  @Column({ type: 'varchar', length: 60 })
  firstName: string;

  @Column({ type: 'varchar', length: 60 })
  lastName: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Column({ type: 'enum', enum: UserRole, enumName: 'user_role', default: UserRole.Customer })
  role: UserRole;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
