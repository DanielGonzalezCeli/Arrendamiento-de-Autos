import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const VERSION = 'v1';

/**
 * Cifrado simétrico autenticado (AES-256-GCM) para secretos que hay que poder leer después
 * (ej. el secret HMAC de un webhook: no se puede guardar con hash porque se necesita para firmar).
 * Formato: "v1:" + base64(iv | tag | ciphertext).
 */
export class SecretBox {
  private constructor(private readonly key: Buffer) {}

  /**
   * Clave explícita (DATA_ENCRYPTION_KEY, 32 bytes en base64) o derivada con HKDF-SHA256 de otro
   * secreto de la aplicación, con un contexto propio: nunca se reutiliza la misma clave para dos usos.
   */
  static fromConfig(explicitKeyBase64: string | undefined, fallbackSecret: string): SecretBox {
    if (explicitKeyBase64) {
      const key = Buffer.from(explicitKeyBase64, 'base64');
      if (key.length !== 32) throw new Error('DATA_ENCRYPTION_KEY debe ser de 32 bytes en base64');
      return new SecretBox(key);
    }
    return new SecretBox(Buffer.from(hkdfSync('sha256', fallbackSecret, 'rutalibre', 'webhook-secrets-v1', 32)));
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return `${VERSION}:${Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64')}`;
  }

  decrypt(sealed: string): string {
    const [version, payload] = sealed.split(':');
    if (version !== VERSION || !payload) throw new Error('Formato de secreto cifrado desconocido');
    const data = Buffer.from(payload, 'base64');
    const decipher = createDecipheriv(ALGORITHM, this.key, data.subarray(0, IV_BYTES));
    decipher.setAuthTag(data.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    return Buffer.concat([decipher.update(data.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString('utf8');
  }
}
