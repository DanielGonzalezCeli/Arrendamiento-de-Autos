/**
 * Tabla de enrutamiento: prefijo de la URL pública → microservicio. Gana el prefijo más largo, así una
 * ruta concreta (p. ej. `/api/auth` → ms-identidad) puede salir del monolito sin tocar el resto.
 * Fase A: todo lo atendía ms-reservas (el monolito). Fase B: registro, login y gestión de usuarios → ms-identidad.
 * Cada fase siguiente agrega su fila.
 */
export interface Route {
  prefix: string;
  service: string;
}

export const ROUTES: Route[] = [
  { prefix: '/', service: 'ms-reservas' },
  { prefix: '/api/auth', service: 'ms-identidad' },
  { prefix: '/api/admin/users', service: 'ms-identidad' },
];

/** Rutas propias del gateway; nunca se reenvían. */
export const GATEWAY_PREFIX = '/gateway';

function matches(path: string, prefix: string): boolean {
  if (prefix === '/') return true;
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function resolveRoute(path: string, routes: Route[] = ROUTES): Route | null {
  let best: Route | null = null;
  for (const route of routes) {
    if (matches(path, route.prefix) && (!best || route.prefix.length > best.prefix.length)) best = route;
  }
  return best;
}
