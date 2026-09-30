const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Evita enviar a PostgreSQL ids con formato inválido (provocaría un 500 en vez de un 400/404). */
export function isUuid(value: string | undefined | null): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}
