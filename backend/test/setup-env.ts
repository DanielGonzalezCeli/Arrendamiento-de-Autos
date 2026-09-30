import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

process.env.LOG_LEVEL = 'silent';
// Los ciclos periódicos se ejecutan a mano en los tests (runOnce) para que sean deterministas.
process.env.WEBHOOK_DISPATCH_INTERVAL_MS = '0';
process.env.MAINTENANCE_INTERVAL_MS = '0';

// En local, los tests que usan la BD leen backend/.env; en CI las variables vienen del workflow.
// (process.loadEnvFile no está disponible dentro del sandbox de Jest, por eso se lee a mano.)
const envFile = resolve(__dirname, '..', '.env');
if (!process.env.DATABASE_URL && existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^"|"$/g, '');
  }
}
