/** Configuración del gateway, solo por variables de entorno (igual que los microservicios). */
export interface GatewayConfig {
  port: number;
  /** URL base de cada microservicio, por nombre lógico (ver routes.ts). */
  services: Record<string, string>;
  /** Peticiones por minuto y por IP de cliente; 0 lo desactiva. */
  rateLimitPerMinute: number;
  /** Tiempo máximo de espera de un microservicio antes de responder 504. */
  proxyTimeoutMs: number;
  /**
   * Proxies de confianza delante del gateway (el front-end de Azure App Service es 1). Con 0 la IP del
   * cliente es la del socket; con N se toma la entrada que agregó el proxy más lejano de confianza.
   */
  trustProxyHops: number;
  logLevel: string;
}

function intFrom(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} debe ser un entero >= 0 (recibido "${raw}")`);
  return value;
}

function urlFrom(env: NodeJS.ProcessEnv, name: string, fallback: string): string {
  const raw = (env[name] ?? fallback).replace(/\/+$/, '');
  if (!/^https?:\/\/\S+$/.test(raw)) throw new Error(`${name} debe ser una URL http(s) (recibido "${raw}")`);
  return raw;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  return {
    port: intFrom(env, 'PORT', 8080),
    services: {
      'ms-reservas': urlFrom(env, 'MS_RESERVAS_URL', 'http://localhost:3000'),
      'ms-identidad': urlFrom(env, 'MS_IDENTIDAD_URL', 'http://localhost:3002'),
    },
    rateLimitPerMinute: intFrom(env, 'RATE_LIMIT_PER_MINUTE', 300),
    proxyTimeoutMs: intFrom(env, 'PROXY_TIMEOUT_MS', 30_000),
    trustProxyHops: intFrom(env, 'TRUST_PROXY_HOPS', 0),
    logLevel: env.LOG_LEVEL ?? 'info',
  };
}
