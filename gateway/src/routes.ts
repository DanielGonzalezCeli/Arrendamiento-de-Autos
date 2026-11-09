/**
 * Tabla de enrutamiento: prefijo de la URL pública → microservicio. Gana el prefijo más largo, así una
 * ruta concreta (p. ej. `/api/auth` → ms-identidad) puede salir del monolito sin tocar el resto.
 * Fase A: todavía todo lo atiende ms-reservas (el monolito); cada fase siguiente agrega su fila.
 */
export interface Route {
  prefix: string;
  service: string;
}

export const ROUTES: Route[] = [
  { prefix: '/', service: 'ms-reservas' },
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
