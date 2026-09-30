import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** request_id de las respuestas del contrato = X-Request-Id que genera/propaga el logger (pino-http). */
export const RequestId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => String(context.switchToHttp().getRequest().id ?? ''),
);
