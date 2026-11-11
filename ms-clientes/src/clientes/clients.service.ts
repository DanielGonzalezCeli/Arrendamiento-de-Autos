import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Counter } from 'prom-client';
import { DataSource, Like } from 'typeorm';
import { metrics } from '../common/metrics';
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

const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

/** Forma canónica del correo (en Gmail sin puntos ni "+etiqueta"): mismas reglas que ms-identidad. */
export function canonicalEmail(value: string): string {
  const email = value.trim().toLowerCase();
  const [local, domain] = email.split('@');
  if (!domain || !GMAIL_DOMAINS.has(domain)) return email;
  return `${local.split('+')[0].replace(/\./g, '')}@gmail.com`;
}

/** Para los logs: "daniel@gmail.com" → "d***@gmail.com" (sin exponer datos personales completos). */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  return domain ? `${local.slice(0, 1)}***@${domain}` : '***';
}

const registrations = new Counter({
  name: 'clients_registrations_total',
  help: 'Altas de clientes (buscar o crear), por origen y resultado (creado o ya existía)',
  labelNames: ['source', 'result'],
  registers: [metrics],
});

/** Máximo de resultados de una búsqueda parcial (mostrador). */
const SEARCH_LIMIT = 50;

/**
 * Clientes cross-platform (contrato v3.1). La identificación manda: si coincide, es la misma persona aunque
 * el correo sea otro; si no, se busca por correo canónico. Nunca se crea un duplicado.
 */
@Injectable()
export class ClientsService {
  private readonly logger = new Logger(ClientsService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  private get repo() {
    return this.dataSource.getRepository(Client);
  }

  async find(criteria: { email?: string | null; identification?: string | null }): Promise<Client | null> {
    if (criteria.identification) {
      const byId = await this.repo.findOneBy({ identification: normalizeIdentification(criteria.identification) });
      if (byId) return byId;
    }
    return criteria.email ? this.repo.findOneBy({ emailCanonical: canonicalEmail(criteria.email) }) : null;
  }

  findById(id: string): Promise<Client | null> {
    return this.repo.findOneBy({ id });
  }

  /** Búsqueda parcial por identificación (mostrador: "1710" encuentra "1710000009"). */
  search(identificationPart: string): Promise<Client[]> {
    const term = normalizeIdentification(identificationPart);
    if (!term) return Promise.resolve([]);
    return this.repo.find({ where: { identification: Like(`%${term}%`) }, take: SEARCH_LIMIT, order: { createdAt: 'DESC' } });
  }

  /**
   * Devuelve el cliente existente o lo crea. Completa teléfono y licencia si faltaban, sin pisar lo que ya había.
   * Dos altas simultáneas de la misma persona no fallan: ON CONFLICT DO NOTHING y se relee.
   */
  async findOrCreate(input: ClientInput): Promise<{ client: Client; created: boolean }> {
    const identification = normalizeIdentification(input.identification);
    const existing = await this.find({ email: input.email, identification });
    if (existing) {
      const patch: Partial<Client> = {};
      if (!existing.phone && input.phone) patch.phone = input.phone;
      if (!existing.licenseNumber && input.licenseNumber) patch.licenseNumber = input.licenseNumber;
      if (Object.keys(patch).length) await this.repo.update(existing.id, patch);
      registrations.inc({ source: input.source, result: 'ya_existia' });
      return { client: { ...existing, ...patch }, created: false };
    }

    const inserted: { id: string }[] = await this.dataSource.query(
      `INSERT INTO clientes.clients (full_name, email, email_canonical, identification, phone, license_number, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING RETURNING id`,
      [input.fullName, input.email.trim().toLowerCase(), canonicalEmail(input.email), identification,
        input.phone ?? null, input.licenseNumber ?? null, input.source],
    );
    const client = inserted.length
      ? await this.repo.findOneByOrFail({ id: inserted[0].id })
      : await this.find({ email: input.email, identification });
    if (!client) throw new Error('No se pudo registrar ni recuperar el cliente');
    if (inserted.length) this.logger.log(`Cliente creado ${client.id} (${input.source}) ${maskEmail(client.email)}`);
    registrations.inc({ source: input.source, result: inserted.length ? 'creado' : 'ya_existia' });
    return { client, created: inserted.length > 0 };
  }
}
