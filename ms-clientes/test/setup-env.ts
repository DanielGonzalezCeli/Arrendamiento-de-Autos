import { generateKeyPairSync } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

process.env.LOG_LEVEL = 'silent';
process.env.NODE_ENV ??= 'test';

// En local los tests leen ms-clientes/.env; en CI las variables vienen del workflow.
const envFile = resolve(__dirname, '..', '.env');
if (!process.env.DATABASE_URL && existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^"|"$/g, '');
  }
}

export const TEST_API_KEY = 'clave-de-prueba-ms-clientes-0123456789';
process.env.BOOKING_API_KEY = TEST_API_KEY;
// Tokens de administrador como los de ms-identidad, firmados con un par de claves de prueba.
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
process.env.IDENTITY_JWT_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }).toString();
process.env.TEST_IDENTITY_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
process.env.IDENTITY_URL = '';
