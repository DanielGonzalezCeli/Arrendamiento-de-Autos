import { UserRole } from '../../domain/enums';

/** Usuario web autenticado (adjuntado a request.user por UserJwtGuard). */
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

/** Claims del JWT de usuario web. */
export interface UserJwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}

/**
 * Emisor (ms-identidad) y audiencia de los tokens web: distintos de los de la API de integración, así un token web
 * no sirve allí, ni al revés.
 */
export const USER_JWT_ISSUER = 'rutalibre-identidad';
export const USER_JWT_AUDIENCE = 'rutalibre-internal-api';

/** Dueño de una reserva creada desde la web (el contrato usa el claim sub como ownerId). */
export function webOwnerSub(userId: string): string {
  return `user:${userId}`;
}
