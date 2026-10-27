import { Injectable, Logger, NestMiddleware, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NextFunction, Request, Response } from 'express';
import { createWriteStream, mkdirSync, WriteStream } from 'fs';
import { dirname, resolve } from 'path';
import { newCorrelationId } from '../../common/problem-details/problem-details-v3';

const MAX_CORRELATION_ID_LENGTH = 100;

/**
 * Trazabilidad del contrato v3: respeta el X-Correlation-Id de Booking (o genera uno), lo devuelve en la
 * respuesta y escribe una línea JSON por petición en un archivo físico (requisito 7 de la guía: logs con
 * correlation_id e idempotency_key). Nunca registra cabeceras de autenticación ni el cuerpo.
 */
@Injectable()
export class CorrelationMiddleware implements NestMiddleware, OnModuleDestroy {
  private readonly logger = new Logger('IntegrationV3');
  private readonly stream: WriteStream | null;

  constructor(config: ConfigService) {
    const file = config.get<string>('INTEGRATION_LOG_FILE');
    this.stream = file && file !== 'off' ? openLog(resolve(file), this.logger) : null;
  }

  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header('x-correlation-id')?.trim();
    const correlationId = incoming && incoming.length <= MAX_CORRELATION_ID_LENGTH ? incoming : newCorrelationId();
    (req as Request & { correlationId: string }).correlationId = correlationId;
    res.setHeader('X-Correlation-Id', correlationId);

    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const entry = {
        time: new Date().toISOString(),
        correlation_id: correlationId,
        idempotency_key: req.header('idempotency-key') ?? null,
        node: req.header('x-node-id') ?? null,
        method: req.method,
        path: req.originalUrl.split('?')[0],
        status: res.statusCode,
        duration_ms: Number((process.hrtime.bigint() - started) / 1_000_000n),
        ip: req.ip,
      };
      this.stream?.write(`${JSON.stringify(entry)}\n`);
      this.logger.log(`${entry.method} ${entry.path} ${entry.status} ${entry.duration_ms}ms cid=${correlationId}`);
    });
    next();
  }

  onModuleDestroy(): void {
    this.stream?.end();
  }
}

function openLog(path: string, logger: Logger): WriteStream | null {
  try {
    mkdirSync(dirname(path), { recursive: true });
    const stream = createWriteStream(path, { flags: 'a' });
    stream.on('error', (error) => logger.warn(`No se pudo escribir el log de integración: ${error.message}`));
    return stream;
  } catch (error) {
    logger.warn(`Log de integración desactivado: ${(error as Error).message}`);
    return null;
  }
}
