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

/** Emisor y audiencia propios: un token web no es válido en la API de integración, ni al revés. */
export const USER_JWT_ISSUER = 'rutalibre-web';
export const USER_JWT_AUDIENCE = 'rutalibre-internal-api';

/** Dueño de una reserva creada desde la web (el contrato usa el claim sub como ownerId). */
export function webOwnerSub(userId: string): string {
  return `user:${userId}`;
}
