import 'reflect-metadata';
import { validateEnv } from '../../src/config/env.validation';

describe('validateEnv', () => {
  const base = { DATABASE_URL: 'postgresql://x', USER_JWT_SECRET: 'x'.repeat(32) };

  it('las variables vacías de .env.example se tratan como no definidas (valores por defecto)', () => {
    const env = validateEnv({ ...base, API_DEPRECATION_DATE: '', INTEGRATION_JWKS_URL: '', LOCAL_OAUTH_ISSUER_ENABLED: '' });
    expect(env.API_DEPRECATION_DATE).toBeUndefined();
    expect(env.LOCAL_OAUTH_ISSUER_ENABLED).toBe(true);
  });

  it('"false" se interpreta como booleano falso', () => {
    expect(validateEnv({ ...base, LOCAL_OAUTH_ISSUER_ENABLED: 'false' }).LOCAL_OAUTH_ISSUER_ENABLED).toBe(false);
  });

  it('falla rápido si falta un secreto obligatorio o es corto', () => {
    expect(() => validateEnv({ DATABASE_URL: 'postgresql://x', USER_JWT_SECRET: 'corto' })).toThrow(/USER_JWT_SECRET/);
  });
});
