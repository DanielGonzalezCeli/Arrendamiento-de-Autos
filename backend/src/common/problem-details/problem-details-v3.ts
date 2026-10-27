import { HttpException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request } from 'express';
import { QueryFailedError } from 'typeorm';
import { CleaningCooldownError, DomainError, InvalidParam, ProblemCode } from '../../domain/domain-error';
import { IdempotencyKeyReusedError } from '../../modules/idempotency/idempotency.service';
import { ProblemException } from './problem-details';

/** Prefijo de las rutas del contrato v3 (Booking Prototipo). */
export const V3_BASE_PATH = '/api/v3';

/**
 * Códigos del contrato autos-openapi-v3.yaml. Regla de la Saga: SOLO 409 con VEHICLE_UNAVAILABLE,
 * OUT_OF_STOCK o VEHICLE_IN_CLEANING_COOLDOWN dispara la compensación en Booking.
 */
export enum V3Code {
  VehicleUnavailable = 'VEHICLE_UNAVAILABLE',
  OutOfStock = 'OUT_OF_STOCK',
  VehicleInCleaningCooldown = 'VEHICLE_IN_CLEANING_COOLDOWN',
  DriverUnderage = 'DRIVER_UNDERAGE',
  InvalidDates = 'INVALID_DATES',
  InvalidPayload = 'INVALID_PAYLOAD',
  MalformedRequest = 'MALFORMED_REQUEST',
  IdempotencyConflict = 'IDEMPOTENCY_CONFLICT',
  // Genéricos (no definidos como enum en el contrato, que deja `code` libre):
  Unauthorized = 'UNAUTHORIZED',
  Forbidden = 'FORBIDDEN',
  NotFound = 'NOT_FOUND',
  CancellationNotAllowed = 'CANCELLATION_NOT_ALLOWED',
  RateLimitExceeded = 'RATE_LIMIT_EXCEEDED',
  ServiceUnavailable = 'SERVICE_UNAVAILABLE',
  InternalError = 'INTERNAL_ERROR',
}

const V3_CODES = new Set<string>(Object.values(V3Code));

/** ProblemDetails del contrato v3 (RFC 7807 + code, correlation_id, timestamp, invalid_params). */
export interface ProblemDetailsV3 {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  correlation_id: string;
  timestamp: string;
  invalid_params?: InvalidParam[];
}

/**
 * Error del contrato v3. Es un DomainError para que IdempotencyService lo guarde y lo reproduzca
 * con el mismo código en un reintento.
 */
export function v3Error(status: number, code: V3Code, title: string, detail: string, invalidParams?: InvalidParam[]): DomainError {
  return new DomainError(code as unknown as ProblemCode, status, title, detail, invalidParams);
}

interface Translated {
  status: number;
  code: string;
  title: string;
  detail: string;
  invalidParams?: InvalidParam[];
}

/** Nombres de campo internos → nombres del contrato v3. */
function renameParam(name: string): string {
  if (name.startsWith('dates.dropoff')) return 'dropoff_date';
  if (name.startsWith('dates')) return 'pickup_date';
  return name;
}

/** Traduce un error del dominio (códigos del contrato v1) a la semántica del v3. */
export function translateToV3(error: DomainError): Translated {
  const base = { title: error.title, detail: error.detail ?? error.title, invalidParams: error.invalidParams };
  if (V3_CODES.has(error.code)) return { ...base, status: error.status, code: error.code };
  if (error instanceof IdempotencyKeyReusedError) return { ...base, status: 400, code: V3Code.IdempotencyConflict };
  if (error instanceof CleaningCooldownError) return { ...base, status: 409, code: V3Code.VehicleInCleaningCooldown };

  switch (error.code) {
    case ProblemCode.CarNoLongerAvailable:
      return { ...base, status: 409, code: V3Code.VehicleUnavailable };
    case ProblemCode.DriverAgeRestriction:
      return { ...base, status: 422, code: V3Code.DriverUnderage, invalidParams: [{ name: 'driver.age', reason: error.detail ?? 'edad insuficiente' }] };
    case ProblemCode.DepotClosed:
      return { ...base, status: 422, code: V3Code.InvalidDates, invalidParams: [{ name: 'pickup_time', reason: error.detail ?? 'agencia cerrada' }] };
    case ProblemCode.CancellationNotAllowed:
      return { ...base, status: 409, code: V3Code.CancellationNotAllowed };
  }
  if (error.status === 404) return { ...base, status: 404, code: V3Code.NotFound };
  // "Petición en curso con la misma Idempotency-Key": NO es 409, porque Booking compensaría una reserva que sí se hará.
  if (error.status === 409 && error.retryAfterSeconds) return { ...base, status: 400, code: V3Code.IdempotencyConflict };
  if (error.status === 400) {
    const invalidParams = error.invalidParams?.map((p) => ({ ...p, name: renameParam(p.name) }));
    const aboutDates = error.invalidParams?.some((p) => p.name.startsWith('dates'));
    return { ...base, invalidParams, status: 422, code: aboutDates ? V3Code.InvalidDates : V3Code.InvalidPayload };
  }
  return { ...base, status: error.status, code: error.status >= 500 ? V3Code.InternalError : V3Code.InvalidPayload };
}

const HTTP_DEFAULTS: Record<number, [V3Code, string]> = {
  400: [V3Code.MalformedRequest, 'Solicitud mal formada'],
  401: [V3Code.Unauthorized, 'No autenticado'],
  403: [V3Code.Forbidden, 'Acceso denegado'],
  404: [V3Code.NotFound, 'Recurso no encontrado'],
  413: [V3Code.MalformedRequest, 'Solicitud demasiado grande'],
  429: [V3Code.RateLimitExceeded, 'Demasiadas solicitudes'],
  503: [V3Code.ServiceUnavailable, 'Servicio no disponible'],
};

function translateAny(exception: unknown): Translated {
  if (exception instanceof DomainError) return translateToV3(exception);

  if (exception instanceof ProblemException) {
    const p = exception.problem;
    const error = new DomainError(p.code, p.status, p.title, p.detail, p.invalidParams);
    return translateToV3(error);
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const [code, title] = HTTP_DEFAULTS[status] ?? [V3Code.InternalError, 'Error'];
    const body = exception.getResponse();
    const message = typeof body === 'string' ? body : (body as { message?: string | string[] }).message;
    const detail = Array.isArray(message) ? message.join('; ') : message ?? title;
    return { status, code, title, detail };
  }

  if (exception instanceof QueryFailedError && (exception as QueryFailedError & { code?: string }).code === '23P01') {
    return { status: 409, code: V3Code.VehicleUnavailable, title: 'Vehículo no disponible', detail: 'El vehículo ya está reservado en ese periodo' };
  }
  return { status: 500, code: V3Code.InternalError, title: 'Error interno del servidor', detail: 'Ocurrió un error inesperado' };
}

export function correlationIdOf(req: Request): string {
  return (req as Request & { correlationId?: string }).correlationId ?? newCorrelationId();
}

export function newCorrelationId(): string {
  return `cid-aut-${randomUUID().slice(0, 8)}`;
}

export function toProblemV3(exception: unknown, req: Request): ProblemDetailsV3 {
  const t = translateAny(exception);
  const problem: ProblemDetailsV3 = {
    type: `https://booking.epn.edu.ec/errors/${t.code.toLowerCase().replace(/_/g, '-')}`,
    title: t.title,
    status: t.status,
    detail: t.detail,
    instance: req.originalUrl.split('?')[0],
    code: t.code,
    correlation_id: correlationIdOf(req),
    timestamp: new Date().toISOString(),
  };
  if (t.invalidParams?.length) problem.invalid_params = t.invalidParams;
  return problem;
}

export function isV3Request(req: Request): boolean {
  return req.originalUrl === V3_BASE_PATH || req.originalUrl.startsWith(`${V3_BASE_PATH}/`) || req.originalUrl.startsWith(`${V3_BASE_PATH}?`);
}
