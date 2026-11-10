import { createPrivateKey, randomUUID } from 'crypto';
import { SignJWT } from 'jose';
import { UserRole } from '../src/domain/enums';
import { USER_JWT_AUDIENCE, USER_JWT_ISSUER } from '../src/modules/auth/auth-user';

export interface TestUser {
  id: string;
  email: string;
  token: string;
  headers: { Authorization: string };
}

/**
 * Token de usuario como los que emite ms-identidad (RS256, mismo emisor y audiencia), firmado con la clave de
 * prueba de test/setup-env.ts. Así los tests de ms-reservas no dependen de que ms-identidad esté corriendo.
 */
export async function testUser(role: UserRole = UserRole.Customer, overrides: { email?: string; expiresIn?: string; issuer?: string } = {}): Promise<TestUser> {
  const id = randomUUID();
  const email = overrides.email ?? `test+${id.slice(0, 8)}@rutalibre.test`;
  const token = await new SignJWT({ email, role })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(overrides.issuer ?? USER_JWT_ISSUER)
    .setAudience(USER_JWT_AUDIENCE)
    .setSubject(id)
    .setIssuedAt()
    .setExpirationTime(overrides.expiresIn ?? '1h')
    .sign(createPrivateKey(process.env.TEST_IDENTITY_PRIVATE_KEY!));
  return { id, email, token, headers: { Authorization: `Bearer ${token}` } };
}
