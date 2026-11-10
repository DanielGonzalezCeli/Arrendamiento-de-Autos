import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter, HttpException, HttpStatus, Logger, ValidationError } from '@nestjs/common';
import { Response } from 'express';
import { QueryFailedError } from 'typeorm';

/**
 * Errores con el mismo formato ProblemDetails (RFC 7807) que ms-reservas: la web los muestra igual sin
 * importar qué microservicio respondió.
 */
export enum ProblemCode {
  ValidationFailed = 'VALIDATION_FAILED',
  RateLimitExceeded = 'RATE_LIMIT_EXCEEDED',
}

export interface InvalidParam {
  name: string;
  reason: string;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: ProblemCode;
  detail?: string;
  invalidParams?: InvalidParam[];
}

const PROBLEM_TYPE_BASE = 'https://api.booking-hub.com/errors/';
const PG_UNIQUE_VIOLATION = '23505';

const DEFAULT_TITLES: Record<number, string> = {
  400: 'Petición inválida',
  401: 'No autenticado',
  403: 'Prohibido',
  404: 'Recurso no encontrado',
  409: 'Conflicto',
  429: 'Demasiadas peticiones',
  503: 'Servicio no disponible',
};

/** Error de regla de negocio; el filtro lo convierte en application/problem+json. */
export class DomainError extends Error {
  constructor(
    readonly status: number,
    readonly title: string,
    readonly detail?: string,
    readonly invalidParams?: InvalidParam[],
  ) {
    super(detail ?? title);
  }

  static conflict(detail: string, invalidParams?: InvalidParam[]): DomainError {
    return new DomainError(409, 'Conflicto', detail, invalidParams);
  }

  static notFound(detail: string): DomainError {
    return new DomainError(404, 'Recurso no encontrado', detail);
  }
}

export function buildProblem(status: number, title: string, code: ProblemCode, detail?: string, invalidParams?: InvalidParam[]): ProblemDetails {
  const problem: ProblemDetails = { type: `${PROBLEM_TYPE_BASE}${code.toLowerCase().replace(/_/g, '-')}`, title, status, code };
  if (detail) problem.detail = detail;
  if (invalidParams?.length) problem.invalidParams = invalidParams;
  return problem;
}

class ProblemException extends HttpException {
  constructor(readonly problem: ProblemDetails) {
    super(problem, problem.status);
  }
}

/** Errores de ValidationPipe → ProblemDetails con invalidParams. */
export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
  return new ProblemException(
    buildProblem(400, 'Petición inválida', ProblemCode.ValidationFailed, 'Uno o más campos no son válidos', flatten(errors)),
  ) as unknown as BadRequestException;
}

function flatten(errors: ValidationError[], parent = ''): InvalidParam[] {
  return errors.flatMap((error) => {
    const name = parent ? `${parent}.${error.property}` : error.property;
    const own = error.constraints ? [{ name, reason: Object.values(error.constraints).join('; ') }] : [];
    return [...own, ...flatten(error.children ?? [], name)];
  });
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const problem = this.toProblem(exception);
    if (problem.status >= 500) this.logger.error(exception instanceof Error ? exception.stack : exception);
    response.setHeader('Cache-Control', 'no-store');
    response.status(problem.status).type('application/problem+json').json(problem);
  }

  private toProblem(exception: unknown): ProblemDetails {
    if (exception instanceof ProblemException) return exception.problem;
    if (exception instanceof DomainError) {
      return buildProblem(exception.status, exception.title, ProblemCode.ValidationFailed, exception.detail, exception.invalidParams);
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = status === HttpStatus.TOO_MANY_REQUESTS ? ProblemCode.RateLimitExceeded : ProblemCode.ValidationFailed;
      return buildProblem(status, DEFAULT_TITLES[status] ?? exception.name, code, this.messageOf(exception));
    }
    if (exception instanceof QueryFailedError && (exception as QueryFailedError & { code?: string }).code === PG_UNIQUE_VIOLATION) {
      return buildProblem(409, 'Conflicto', ProblemCode.ValidationFailed, 'El recurso ya existe');
    }
    return buildProblem(500, 'Error interno del servidor', ProblemCode.ValidationFailed, 'Ocurrió un error inesperado');
  }

  private messageOf(exception: HttpException): string | undefined {
    const body = exception.getResponse();
    if (typeof body === 'string') return body;
    const message = (body as { message?: string | string[] }).message;
    return Array.isArray(message) ? message.join('; ') : message;
  }
}
