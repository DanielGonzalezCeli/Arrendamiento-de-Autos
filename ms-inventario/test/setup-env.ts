import { generateKeyPairSync } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

process.env.LOG_LEVEL = 'silent';
process.env.NODE_ENV ??= 'test';

// En local los tests leen ms-inventario/.env; en CI las variables vienen del workflow.
const envFile = resolve(__dirname, '..', '.env');
if (!process.env.DATABASE_URL && existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^"|"$/g, '');
  }
}

/** Booking simulado por gRPC (inventory.proto oficial). */
export const FAKE_BOOKING_GRPC_PORT = 50_996;
process.env.STOCK_SYNC_MODE = 'grpc';
process.env.BOOKING_GRPC_TARGET = `127.0.0.1:${FAKE_BOOKING_GRPC_PORT}`;
process.env.INVENTORY_PROTO_PATH = resolve(__dirname, '..', '..', 'contracts', 'inventory.proto');
process.env.NODE_ID = 'NODE_AUT_RUTALIBRE';

// RabbitMQ solo si se define AMQP_TEST_URL (en CI, un contenedor rabbitmq). Exchange y cola propios de la corrida.
export const RUN_ID = `test-${Date.now().toString(36)}`;
process.env.AMQP_URL = process.env.AMQP_TEST_URL ?? '';
process.env.AMQP_EXCHANGE = `rutalibre.eventos.${RUN_ID}`;
process.env.AMQP_QUEUE = `ms-inventario.flota.${RUN_ID}`;

// Tokens de administrador como los de ms-identidad, firmados con un par de claves de prueba.
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
process.env.IDENTITY_JWT_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }).toString();
process.env.TEST_IDENTITY_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
process.env.IDENTITY_URL = '';
