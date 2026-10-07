import * as bcrypt from 'bcryptjs';

/** Costo de bcrypt (2^12 iteraciones): lento a propósito para frenar ataques de fuerza bruta. */
export const BCRYPT_COST = 12;

/** Única forma de guardar contraseñas (registro, seed y panel de administración). */
export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}
