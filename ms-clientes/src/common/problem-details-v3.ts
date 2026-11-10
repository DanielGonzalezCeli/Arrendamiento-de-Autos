import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';

/** Códigos del contrato v3 que usa este servicio (mismo formato de error que ms-reservas en /api/v3). */
export enum V3Code {
  InvalidPayload = 'INVALID_PAYLOAD',
  MalformedRequest = 'MALFORMED_REQUEST',
  Unauthorized = 'UNAUTHORIZED',
  Forbidden = 'FORBIDDEN',
  NotFound = 'NOT_FOUND',
  Conflict = 'CONFLICT',
  ServiceUnavailable = 'SERVICE_UNAVAILABLE',
  InternalError = 'INTERNAL_ERROR',
}

export interface InvalidParam {
  name: string;
  reason: string;
}

/** Error con la semántica del contrato v3; el filtro lo convierte en application/problem+json. */
export class V3Error extends Error {
  constructor(
    readonly status: number,
    readonly code: V3Code,
    readonly title: string,
    readonly detail: string,
    readonly invalidParams?: InvalidParam[],
  ) {
    super(detail);
  }
}

const HTTP_DEFAULTS: Record<number, [V3Code, string]> = {
  400: [V3Code.MalformedRequest, 'Solicitud mal formada'],
  401: [V3Code.Unauthorized, 'No autenticado'],
  403: [V3Code.Forbidden, 'Acceso denegado'],
  404: [V3Code.NotFound, 'Recurso no encontrado'],
  413: [V3Code.MalformedRequest, 'Solicitud demasiado grande'],
};

const MAX_CORRELATION_ID_LENGTH = 100;

/** Respeta el X-Correlation-Id del gateway o de ms-reservas (o genera uno) y lo devuelve en la respuesta. */
export function correlationMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-correlation-id')?.trim();
  const id = incoming && incoming.length <= MAX_CORRELATION_ID_LENGTH ? incoming : `cid-cli-${randomUUID().slice(0, 8)}`;
  req.headers['x-correlation-id'] = id;
  res.setHeader('X-Correlation-Id', id);
  next();
}

export function correlationIdOf(req: Request): string {
  return req.headers['x-correlation-id'] as string;
}

/** ProblemDetails del contrato v3 (RFC 7807 + code, correlation_id, timestamp, invalid_params). */
@Catch()
export class ProblemDetailsV3Filter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsV3Filter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const req = host.switchToHttp().getRequest<Request>();
    const res = host.switchToHttp().getResponse<Response>();
    const t = this.translate(exception);
    if (t.status >= 500) this.logger.error(exception instanceof Error ? exception.stack : exception);
    const problem: Record<string, unknown> = {
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
    res.setHeader('Cache-Control', 'no-store');
    res.status(t.status).type('application/problem+json').json(problem);
  }

  private translate(exception: unknown): { status: number; code: string; title: string; detail: string; invalidParams?: InvalidParam[] } {
    if (exception instanceof V3Error) return exception;
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const [code, title] = HTTP_DEFAULTS[status] ?? [V3Code.InternalError, 'Error'];
      const body = exception.getResponse();
      const message = typeof body === 'string' ? body : (body as { message?: string | string[] }).message;
      return { status, code, title, detail: (Array.isArray(message) ? message.join('; ') : message) ?? title };
    }
    if (exception instanceof QueryFailedError && (exception as QueryFailedError & { code?: string }).code === '23505') {
      return { status: 409, code: V3Code.Conflict, title: 'Conflicto', detail: 'Ya existe un cliente con esa identificación o correo' };
    }
    return { status: 500, code: V3Code.InternalError, title: 'Error interno del servidor', detail: 'Ocurrió un error inesperado' };
  }
}
