import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { canonicalEmail } from '../../domain/contact-rules';
import { UserRole } from '../../domain/enums';
import { User } from './user.entity';

export interface NewUser {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
}

/** Datos públicos de un usuario: nunca incluye passwordHash. */
export interface PublicUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: UserRole;
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    role: user.role,
  };
}

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  /** Busca por el correo canónico: "dan.iel@gmail.com" encuentra la cuenta "daniel@gmail.com". */
  findByEmail(email: string): Promise<User | null> {
    return this.users.findOne({ where: { emailCanonical: canonicalEmail(email) } });
  }

  findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }

  /** RN27: el registro abierto siempre crea clientes; ADMIN solo lo asigna otro ADMIN o el seed. */
  createCustomer(data: NewUser): Promise<User> {
    return this.users.save(
      this.users.create({
        ...data,
        email: data.email.trim().toLowerCase(),
        emailCanonical: canonicalEmail(data.email),
        role: UserRole.Customer,
      }),
    );
  }
}
