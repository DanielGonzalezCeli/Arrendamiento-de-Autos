import { BadRequestException, HttpException, ValidationError } from '@nestjs/common';
import { InvalidParam, ProblemCode } from '../../domain/domain-error';

/**
 * ProblemDetails del contrato (RFC 7807). additionalProperties: false → solo estos campos.
 */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: ProblemCode;
  detail?: string;
  invalidParams?: InvalidParam[];
}

const PROBLEM_TYPE_BASE = 'https://api.booking-hub.com/errors/';

export function buildProblem(
  status: number, title: string, code: ProblemCode, detail?: string, invalidParams?: InvalidParam[],
): ProblemDetails {
  const problem: ProblemDetails = {
    type: `${PROBLEM_TYPE_BASE}${code.toLowerCase().replace(/_/g, '-')}`,
    title,
    status,
    code,
  };
  if (detail) problem.detail = detail;
  if (invalidParams?.length) problem.invalidParams = invalidParams;
  return problem;
}

/** Excepción HTTP que ya transporta un ProblemDetails completo. */
export class ProblemException extends HttpException {
  constructor(readonly problem: ProblemDetails) {
    super(problem, problem.status);
  }
}

/**
 * Reemplaza la respuesta por defecto de ValidationPipe ({ message: [...] }) por un ProblemDetails
 * con invalidParams, usando la ruta del campo (ej. "route.pickup.datetime").
 */
export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
  const invalidParams = flattenValidationErrors(errors);
  return new ProblemException(
    buildProblem(400, 'Petición inválida', ProblemCode.ValidationFailed, 'Uno o más campos no son válidos', invalidParams),
  ) as unknown as BadRequestException;
}

function flattenValidationErrors(errors: ValidationError[], parent = ''): InvalidParam[] {
  return errors.flatMap((error) => {
    const name = parent ? `${parent}.${error.property}` : error.property;
    const own = error.constraints ? [{ name, reason: Object.values(error.constraints).join('; ') }] : [];
    return [...own, ...flattenValidationErrors(error.children ?? [], name)];
  });
}
