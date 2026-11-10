import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

process.env.LOG_LEVEL = 'silent';
process.env.NODE_ENV ??= 'test';
// ms-reservas falso de los tests (la configuración se lee al importar AppModule, antes de beforeAll).
export const FAKE_RESERVAS_PORT = 39151;
process.env.MS_RESERVAS_URL = `http://127.0.0.1:${FAKE_RESERVAS_PORT}`;
// Como detrás del gateway: el límite de intentos de login se aplica por la IP de X-Forwarded-For.
process.env.TRUST_PROXY_HOPS = '1';

// En local los tests leen ms-identidad/.env; en CI las variables vienen del workflow.
const envFile = resolve(__dirname, '..', '.env');
if (!process.env.DATABASE_URL && existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^"|"$/g, '');
  }
}
