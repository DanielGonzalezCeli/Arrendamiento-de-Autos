import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

/** Cliente tal como lo devuelve ms-clientes (mismo formato que /api/v3/clientes). */
export interface ClientView {
  client_id: string;
  nombre: string;
  email: string;
  identificacion: string;
  telefono: string | null;
  licencia: string | null;
  origen: string;
  creado_en: string;
}

export interface ClientInput {
  fullName: string;
  email: string;
  identification: string;
  phone?: string | null;
  licenseNumber?: string | null;
  source: 'BOOKING' | 'WEB' | 'MOSTRADOR';
}

/** Credencial de quien originó la operación, que se reenvía a ms-clientes. */
export type ForwardedCredential = { apiKey: string } | { authorization: string };

/** Llamada hecha en nombre de un administrador (panel y mostrador). */
export interface AdminCallContext {
  credential: ForwardedCredential;
  correlationId?: string;
}

export function adminCallContext(req: Request): AdminCallContext {
  return { credential: { authorization: req.headers.authorization ?? '' }, correlationId: req.headers['x-correlation-id'] as string | undefined };
}

/** Datos del cliente para el panel (mismos nombres que tenía la entidad del monolito). */
export function toAdminClient(c: ClientView) {
  return {
    id: c.client_id, fullName: c.nombre, email: c.email, identification: c.identificacion,
    phone: c.telefono, licenseNumber: c.licencia, source: c.origen, createdAt: c.creado_en,
  };
}

const TIMEOUT_MS = 3000;

/** Cédula, RUC o pasaporte sin espacios, puntos ni guiones, en mayúsculas: "17.1000-0009" ≡ "1710000009". */
export function normalizeIdentification(value: string): string {
  return value.replace(/[\s.-]/g, '').toUpperCase();
}

export const isValidIdentification = (value: string) => /^[A-Z0-9]{5,20}$/.test(value);

/**
 * Fase C: los clientes viven en ms-clientes (schema "clientes"); ms-reservas solo guarda el client_id en la reserva.
 * Llamada directa entre servicios con timeout. No hay secreto propio: se reenvía la X-API-Key de Booking (reservas
 * de Booking) o el token del administrador (panel y mostrador), junto con el X-Correlation-Id.
 *
 * Si ms-clientes no responde, ninguna operación de ms-reservas falla por eso: la reserva se crea sin vínculo y el
 * panel muestra la reserva sin los datos del cliente (se registra un aviso).
 */
@Injectable()
export class ClientsClient {
  private readonly logger = new Logger(ClientsClient.name);
  private readonly baseUrl?: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('CLIENTS_URL')?.replace(/\/+$/, '');
    if (!this.baseUrl) this.logger.warn('CLIENTS_URL no definida: las reservas no se vincularán a un cliente');
  }

  async findById(id: string, credential: ForwardedCredential, correlationId?: string): Promise<ClientView | null> {
    return this.call<ClientView>('GET', `/internal/clientes/${encodeURIComponent(id)}`, credential, correlationId);
  }

  async findOrCreate(input: ClientInput, credential: ForwardedCredential, correlationId?: string): Promise<ClientView | null> {
    return this.call<ClientView>('POST', '/internal/clientes', credential, correlationId, {
      nombre: input.fullName, email: input.email, identificacion: input.identification,
      telefono: input.phone ?? null, licencia: input.licenseNumber ?? null, origen: input.source,
    });
  }

  /** client_id de los clientes cuya identificación contiene el texto (búsqueda del mostrador). */
  async searchIds(identificationPart: string, credential: ForwardedCredential, correlationId?: string): Promise<string[]> {
    const rows = await this.call<ClientView[]>('GET', `/internal/clientes?identificacion=${encodeURIComponent(identificationPart)}`, credential, correlationId);
    return rows?.map((c) => c.client_id) ?? [];
  }

  private async call<T>(method: string, path: string, credential: ForwardedCredential, correlationId?: string, body?: unknown): Promise<T | null> {
    if (!this.baseUrl) return null;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if ('apiKey' in credential) headers['X-API-Key'] = credential.apiKey;
    else headers.Authorization = credential.authorization;
    if (correlationId) headers['X-Correlation-Id'] = correlationId;
    if (body) headers['Content-Type'] = 'application/json';
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (error) {
      this.logger.warn(`ms-clientes no respondió ${method} ${path.split('?')[0]}: ${(error as Error).message} cid=${correlationId ?? '-'}`);
      return null;
    }
  }
}
