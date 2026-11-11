import { generateKeyPairSync } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

process.env.LOG_LEVEL = 'silent';
// Los ciclos periódicos se ejecutan a mano en los tests (runOnce) para que sean deterministas.
process.env.WEBHOOK_DISPATCH_INTERVAL_MS = '0';
process.env.MAINTENANCE_INTERVAL_MS = '0';
// Reto 2: sin log en archivo; los eventos de flota quedan en memoria (sin RabbitMQ) y el snapshot periódico apagado.
process.env.INTEGRATION_LOG_FILE ??= 'off';
process.env.AMQP_URL = '';
process.env.FLEET_SNAPSHOT_INTERVAL_MS = '0';

// En local, los tests que usan la BD leen backend/.env; en CI las variables vienen del workflow.
// (process.loadEnvFile no está disponible dentro del sandbox de Jest, por eso se lee a mano.)
const envFile = resolve(__dirname, '..', '.env');
if (!process.env.DATABASE_URL && existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^"|"$/g, '');
  }
}

// Fase B: los tokens de usuario los emite ms-identidad. En los tests no corre: cada archivo genera su propio par
// de claves RSA, ms-reservas verifica con la pública y test/identity-tokens.ts firma con la privada.
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
process.env.IDENTITY_JWT_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }).toString();
process.env.TEST_IDENTITY_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
process.env.IDENTITY_URL = ''; // sin consulta de estado a ms-identidad (se prueba aparte, con un servidor falso)
process.env.CLIENTS_URL = ''; // sin ms-clientes: las reservas quedan sin cliente (integration-v3 usa uno simulado)
