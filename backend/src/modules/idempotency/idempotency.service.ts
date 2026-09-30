import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { buildProblem, ProblemDetails, ProblemException } from '../../common/problem-details/problem-details';
import { BUSINESS_RULES, HOUR_MS } from '../../domain/business-rules';
import { DomainError, ProblemCode } from '../../domain/domain-error';
import { IdempotencyStatus } from '../../domain/enums';
import { IdempotencyRecord } from './idempotency-record.entity';

export interface IdempotentRequest {
  /** Dueño de la clave (sub del token): la misma clave de otro cliente no colisiona. */
  ownerSub: string;
  key: string;
  /** Operación lógica (ej. "orders.create", "orders.cancel:<id>"). */
  operation: string;
  /** Lo que identifica "el mismo request" (body + parámetros). */
  fingerprint: unknown;
  /** Status HTTP de éxito de la operación (201 create, 200 modify/cancel). */
  successStatus: number;
}

export interface IdempotentResult<T> {
  status: number;
  body: T;
  /** true si la respuesta se reprodujo de un intento anterior. */
  replayed: boolean;
}

/** Segundos que se sugiere esperar si la misma clave está en curso. */
const IN_PROGRESS_RETRY_AFTER = 1;

/**
 * RN24 — Idempotency-Key (docs/ANALISIS_CONTRATO.md §7, confirmado por el equipo de integración):
 *  - misma clave + mismo request  → misma respuesta (mismo status y body), sin repetir la operación;
 *  - misma clave + otro request   → 409;
 *  - misma clave aún en proceso   → 409 + Retry-After;
 *  - error de negocio (4xx)       → se guarda y se reproduce; error inesperado (5xx) → se libera la clave.
 */
@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async execute<T>(request: IdempotentRequest, work: (manager: EntityManager) => Promise<T>): Promise<IdempotentResult<T>> {
    const requestHash = fingerprintHash(request.fingerprint);
    const claimed = await this.claim(request, requestHash);
    if (!claimed) return this.replay<T>(request, requestHash);

    const id = { ownerSub: request.ownerSub, idempotencyKey: request.key, operation: request.operation };
    try {
      return await this.dataSource.transaction(async (manager) => {
        const body = await work(manager);
        // La respuesta se guarda en la MISMA transacción que la operación: o ambas quedan, o ninguna.
        await manager.update(IdempotencyRecord, id, {
          status: IdempotencyStatus.Completed, responseStatus: request.successStatus, responseBody: (body ?? null) as object,
        });
        return { status: request.successStatus, body, replayed: false };
      });
    } catch (error) {
      if (error instanceof DomainError && error.status < 500) {
        const problem = buildProblem(error.status, error.title, error.code, error.detail, error.invalidParams);
        await this.dataSource.getRepository(IdempotencyRecord).update(id, {
          status: IdempotencyStatus.Completed, responseStatus: error.status, responseBody: problem as unknown as object,
        });
      } else {
        await this.dataSource.getRepository(IdempotencyRecord).delete(id);
      }
      throw error;
    }
  }

  /**
   * INSERT … ON CONFLICT DO NOTHING: solo una petición concurrente puede reclamar la clave.
   * Una clave cuyo registro ya expiró (TTL) se libera primero y puede reutilizarse.
   */
  private async claim(request: IdempotentRequest, requestHash: string): Promise<boolean> {
    await this.dataSource.query(
      `DELETE FROM idempotency_records
        WHERE owner_sub = $1 AND idempotency_key = $2 AND operation = $3 AND expires_at <= now()`,
      [request.ownerSub, request.key, request.operation],
    );
    const expiresAt = new Date(Date.now() + BUSINESS_RULES.IDEMPOTENCY_TTL_HOURS * HOUR_MS);
    const rows = await this.dataSource.query(
      `INSERT INTO idempotency_records (owner_sub, idempotency_key, operation, request_hash, status, expires_at)
       VALUES ($1, $2, $3, $4, 'IN_PROGRESS', $5)
       ON CONFLICT (owner_sub, idempotency_key, operation) DO NOTHING
       RETURNING idempotency_key`,
      [request.ownerSub, request.key, request.operation, requestHash, expiresAt],
    );
    return rows.length === 1;
  }

  private async replay<T>(request: IdempotentRequest, requestHash: string): Promise<IdempotentResult<T>> {
    const repository = this.dataSource.getRepository(IdempotencyRecord);
    const record = await repository.findOne({
      where: { ownerSub: request.ownerSub, idempotencyKey: request.key, operation: request.operation },
    });

    if (!record || record.status === IdempotencyStatus.InProgress) {
      throw DomainError.conflict(ProblemCode.ValidationFailed, 'Operación en curso',
        'Hay una petición con esta Idempotency-Key en proceso; reintenta en unos segundos', IN_PROGRESS_RETRY_AFTER);
    }
    if (record.requestHash !== requestHash) {
      throw new DomainError(ProblemCode.ValidationFailed, 409, 'Idempotency-Key reutilizada',
        'La Idempotency-Key ya se usó con un contenido distinto; genera una clave nueva para otra operación');
    }

    this.logger.log(`Idempotency replay ${request.operation} key=${request.key}`);
    if ((record.responseStatus ?? 500) >= 400) throw new ProblemException(record.responseBody as ProblemDetails);
    return { status: record.responseStatus!, body: record.responseBody as T, replayed: true };
  }
}

/** SHA-256 del JSON canónico (claves ordenadas): el orden de las propiedades no cambia la huella. */
export function fingerprintHash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}
