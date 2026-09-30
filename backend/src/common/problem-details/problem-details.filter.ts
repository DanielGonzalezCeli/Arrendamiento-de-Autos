import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { DomainError, ProblemCode } from '../../domain/domain-error';
import { buildProblem, ProblemDetails, ProblemException } from './problem-details';

/** Códigos de error de PostgreSQL relevantes. */
const PG_EXCLUSION_VIOLATION = '23P01';
const PG_UNIQUE_VIOLATION = '23505';

const DEFAULT_TITLES: Record<number, string> = {
  400: 'Petición inválida',
  401: 'No autenticado',
  403: 'Prohibido',
  404: 'Recurso no encontrado',
  409: 'Conflicto',
  429: 'Demasiadas peticiones',
  501: 'No implementado',
};

/**
 * Convierte cualquier error en un ProblemDetails (application/problem+json).
 * El enum `code` del contrato es cerrado: para 401/403/404 y otros casos genéricos se usa
 * VALIDATION_FAILED con el status HTTP correcto (docs/DECISIONES_CONFIRMADAS.md #4).
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const problem = this.toProblem(exception);

    if (problem.status >= 500) this.logger.error(exception instanceof Error ? exception.stack : exception);
    if (exception instanceof DomainError && exception.retryAfterSeconds) {
      response.setHeader('Retry-After', String(exception.retryAfterSeconds));
    }

    response.status(problem.status).type('application/problem+json').json(problem);
  }

  private toProblem(exception: unknown): ProblemDetails {
    if (exception instanceof ProblemException) return exception.problem;

    if (exception instanceof DomainError) {
      return buildProblem(exception.status, exception.title, exception.code, exception.detail, exception.invalidParams);
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = status === HttpStatus.TOO_MANY_REQUESTS ? ProblemCode.RateLimitExceeded : ProblemCode.ValidationFailed;
      return buildProblem(status, DEFAULT_TITLES[status] ?? exception.name, code, this.messageOf(exception));
    }

    if (exception instanceof QueryFailedError) {
      const pgCode = (exception as QueryFailedError & { code?: string }).code;
      if (pgCode === PG_EXCLUSION_VIOLATION) {
        return buildProblem(409, 'Vehículo no disponible', ProblemCode.CarNoLongerAvailable, 'El vehículo ya está reservado en ese periodo');
      }
      if (pgCode === PG_UNIQUE_VIOLATION) {
        return buildProblem(409, 'Conflicto', ProblemCode.ValidationFailed, 'El recurso ya existe');
      }
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
