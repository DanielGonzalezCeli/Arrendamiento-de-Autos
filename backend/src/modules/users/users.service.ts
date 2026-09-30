import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  findByEmail(email: string): Promise<User | null> {
    return this.users.findOne({ where: { email: email.trim().toLowerCase() } });
  }

  findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }

  /** RN27: el registro abierto siempre crea clientes; ADMIN solo lo asigna otro ADMIN o el seed. */
  createCustomer(data: NewUser): Promise<User> {
    return this.users.save(
      this.users.create({ ...data, email: data.email.trim().toLowerCase(), role: UserRole.Customer }),
    );
  }
}
