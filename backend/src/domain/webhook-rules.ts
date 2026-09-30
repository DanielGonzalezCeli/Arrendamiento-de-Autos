import { createHmac, timingSafeEqual } from 'crypto';
import { isIP } from 'net';
import { MINUTE_MS } from './business-rules';

/** Espera antes de cada reintento (1 min, 5 min, 30 min, 2 h, 12 h). Tras el último fallo la entrega queda DEAD. */
export const WEBHOOK_RETRY_DELAYS_MS = [1, 5, 30, 120, 720].map((minutes) => minutes * MINUTE_MS);
export const WEBHOOK_MAX_ATTEMPTS = WEBHOOK_RETRY_DELAYS_MS.length + 1;
export const WEBHOOK_TIMEOUT_MS = 5_000;

/** Header de firma acordado con el equipo de integración (docs/DECISIONES_CONFIRMADAS.md #6). */
export const SIGNATURE_HEADER = 'X-Hub-Signature-256';

/** "sha256=<hex>": HMAC-SHA256 del cuerpo EXACTO enviado, con el secret de la suscripción. */
export function signPayload(rawBody: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`;
}

/** Verificación en tiempo constante (la usaría el receptor; aquí sirve para los tests y la documentación). */
export function verifySignature(rawBody: string, secret: string, signature: string): boolean {
  const expected = Buffer.from(signPayload(rawBody, secret));
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/** Momento del próximo intento, o null si ya no quedan reintentos (→ DEAD). `attempt` = intentos ya realizados. */
export function nextAttemptAt(attempt: number, now: Date): Date | null {
  const delay = WEBHOOK_RETRY_DELAYS_MS[attempt - 1];
  return delay === undefined ? null : new Date(now.getTime() + delay);
}

/**
 * Anti-SSRF: en producción un webhook solo puede apuntar a https y a hosts públicos, para que un
 * suscriptor no use nuestro servidor para llamar a servicios internos (localhost, redes privadas, metadatos cloud).
 * Nota: no protege contra DNS rebinding (un nombre público que resuelve a IP privada); fuera del alcance del MVP.
 */
export function webhookUrlProblem(rawUrl: string, allowInsecure: boolean): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return 'URL inválida';
  }
  if (!['https:', 'http:'].includes(url.protocol)) return 'solo se admite http(s)';
  if (allowInsecure) return null;
  if (url.protocol !== 'https:') return 'en producción el webhook debe usar https';
  if (isPrivateHost(url.hostname)) return 'no se permiten hosts locales o de red privada';
  return null;
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) return true;
  if (isIP(host) === 6) return host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80');
  if (isIP(host) !== 4) return false;
  const [a, b] = host.split('.').map(Number);
  return (
    a === 10 || a === 127 || a === 0 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) // metadatos de instancias cloud
  );
}
