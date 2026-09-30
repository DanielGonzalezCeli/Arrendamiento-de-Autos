import { DomainError } from '../domain/domain-error';

export const DEFAULT_MAXIMUM_RESULTS = 100;

export interface Page<T> {
  items: T[];
  total: number;
  /** Cursor opaco para la siguiente página (metadata.next_page), o null si no hay más. */
  nextPage: string | null;
}

/** Contenido del cursor: desplazamiento y, opcionalmente, el contexto (ej. search_token). */
interface Cursor {
  offset: number;
  context?: string;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

export function decodeCursor(page: string | undefined, context?: string): Cursor {
  if (!page) return { offset: 0 };
  try {
    const cursor = JSON.parse(Buffer.from(page, 'base64url').toString('utf8')) as Cursor;
    const validOffset = Number.isInteger(cursor.offset) && cursor.offset >= 0;
    if (!validOffset || (context !== undefined && cursor.context !== undefined && cursor.context !== context)) {
      throw new Error('cursor inconsistente');
    }
    return cursor;
  } catch {
    throw DomainError.validation('El cursor de página es inválido o expiró', [{ name: 'page', reason: 'cursor inválido' }]);
  }
}

/** Pagina una lista en memoria (los catálogos son pequeños) con cursor opaco. */
export function paginate<T>(items: T[], maximum: number | undefined, page: string | undefined, context?: string): Page<T> {
  const size = maximum ?? DEFAULT_MAXIMUM_RESULTS;
  const { offset } = decodeCursor(page, context);
  const slice = items.slice(offset, offset + size);
  const nextOffset = offset + size;
  return {
    items: slice,
    total: items.length,
    nextPage: nextOffset < items.length ? encodeCursor({ offset: nextOffset, context }) : null,
  };
}
