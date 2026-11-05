import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { canonicalEmail } from '../../domain/contact-rules';
import { Client, ClientSource } from './client.entity';

export interface ClientInput {
  fullName: string;
  email: string;
  identification: string;
  phone?: string | null;
  licenseNumber?: string | null;
  source: ClientSource;
}

/** Cédula, RUC o pasaporte sin espacios, puntos ni guiones, en mayúsculas: "17.1000-0009" ≡ "1710000009". */
export function normalizeIdentification(value: string): string {
  return value.replace(/[\s.-]/g, '').toUpperCase();
}

export const isValidIdentification = (value: string) => /^[A-Z0-9]{5,20}$/.test(value);

/** Para los logs: "daniel@gmail.com" → "d***@gmail.com" (sin exponer datos personales completos). */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  return domain ? `${local.slice(0, 1)}***@${domain}` : '***';
}

/**
 * Clientes cross-platform (contrato v3.1). La identificación manda: si coincide, es la misma persona aunque
 * el correo sea otro; si no, se busca por correo canónico. Nunca se crea un duplicado.
 */
@Injectable()
export class ClientsService {
  private readonly logger = new Logger(ClientsService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async find(criteria: { email?: string | null; identification?: string | null }, manager: EntityManager = this.dataSource.manager): Promise<Client | null> {
    const repo = manager.getRepository(Client);
    if (criteria.identification) {
      const byId = await repo.findOneBy({ identification: normalizeIdentification(criteria.identification) });
      if (byId) return byId;
    }
    return criteria.email ? repo.findOneBy({ emailCanonical: canonicalEmail(criteria.email) }) : null;
  }

  findById(id: string, manager: EntityManager = this.dataSource.manager): Promise<Client | null> {
    return manager.getRepository(Client).findOneBy({ id });
  }

  /**
   * Devuelve el cliente existente o lo crea. Completa teléfono y licencia si faltaban, sin pisar lo que ya había.
   * Dos altas simultáneas de la misma persona no fallan: ON CONFLICT DO NOTHING y se relee.
   */
  async findOrCreate(input: ClientInput, manager: EntityManager = this.dataSource.manager): Promise<{ client: Client; created: boolean }> {
    const identification = normalizeIdentification(input.identification);
    const existing = await this.find({ email: input.email, identification }, manager);
    if (existing) {
      const patch: Partial<Client> = {};
      if (!existing.phone && input.phone) patch.phone = input.phone;
      if (!existing.licenseNumber && input.licenseNumber) patch.licenseNumber = input.licenseNumber;
      if (Object.keys(patch).length) await manager.getRepository(Client).update(existing.id, patch);
      return { client: { ...existing, ...patch }, created: false };
    }

    const inserted: { id: string }[] = await manager.query(
      `INSERT INTO clients (full_name, email, email_canonical, identification, phone, license_number, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING RETURNING id`,
      [input.fullName, input.email.trim().toLowerCase(), canonicalEmail(input.email), identification,
        input.phone ?? null, input.licenseNumber ?? null, input.source],
    );
    const client = inserted.length
      ? await manager.getRepository(Client).findOneByOrFail({ id: inserted[0].id })
      : await this.find({ email: input.email, identification }, manager);
    if (!client) throw new Error('No se pudo registrar ni recuperar el cliente');
    if (inserted.length) this.logger.log(`Cliente creado ${client.id} (${input.source}) ${maskEmail(client.email)}`);
    return { client, created: inserted.length > 0 };
  }
}
