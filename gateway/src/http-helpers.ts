import { randomUUID } from 'crypto';
import { IncomingMessage, ServerResponse } from 'http';
import { isIP } from 'net';

const MAX_CORRELATION_ID_LENGTH = 100;

/** Respeta el X-Correlation-Id entrante (Booking, la web) si es razonable; si no, genera uno. */
export function resolveCorrelationId(incoming: string | string[] | undefined): string {
  const value = (Array.isArray(incoming) ? incoming[0] : incoming)?.trim();
  return value && value.length <= MAX_CORRELATION_ID_LENGTH ? value : `cid-gw-${randomUUID().slice(0, 8)}`;
}

/** Quita el puerto y el prefijo IPv4-mapeado ("1.2.3.4:5678", "[::1]:80", "::ffff:1.2.3.4"). */
export function normalizeIp(raw: string): string {
  let ip = raw.trim();
  const bracketed = ip.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed) ip = bracketed[1];
  else if (/^[\d.]+:\d+$/.test(ip)) ip = ip.slice(0, ip.lastIndexOf(':'));
  if (ip.startsWith('::ffff:') && isIP(ip.slice(7)) === 4) ip = ip.slice(7);
  return ip;
}

/**
 * IP real del cliente. Solo se cree a X-Forwarded-For hasta `trustedHops` saltos desde la derecha (las
 * entradas que agregaron nuestros proxies); lo que esté más a la izquierda lo pudo escribir el cliente.
 */
export function clientIp(req: IncomingMessage, trustedHops: number): string {
  const socketIp = normalizeIp(req.socket.remoteAddress ?? '');
  if (trustedHops === 0) return socketIp;
  const header = req.headers['x-forwarded-for'];
  const chain = (Array.isArray(header) ? header.join(',') : header ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const index = chain.length - trustedHops;
  if (index < 0) return chain.length ? normalizeIp(chain[0]) : socketIp;
  return normalizeIp(chain[index]);
}

/** Error en formato Problem Details (RFC 7807) con la misma forma que el contrato v3 de los microservicios. */
export function sendProblem(req: IncomingMessage, res: ServerResponse, status: number, code: string, title: string, detail: string, correlationId: string): void {
  if (res.headersSent) {
    res.end();
    return;
  }
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/problem+json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({
    type: `https://booking.epn.edu.ec/errors/${code.toLowerCase().replace(/_/g, '-')}`,
    title,
    status,
    detail,
    instance: (req.url ?? '/').split('?')[0],
    code,
    correlation_id: correlationId,
    timestamp: new Date().toISOString(),
  }));
}
