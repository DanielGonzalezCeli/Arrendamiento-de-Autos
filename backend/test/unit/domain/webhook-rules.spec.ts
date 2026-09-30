import { SecretBox } from '../../../src/common/crypto/secret-box';
import {
  nextAttemptAt, signPayload, verifySignature, WEBHOOK_MAX_ATTEMPTS, webhookUrlProblem,
} from '../../../src/domain/webhook-rules';

describe('Firma de webhooks (X-Hub-Signature-256)', () => {
  const body = '{"eventId":"1","eventType":"CAR_ORDER_CONFIRMED"}';

  it('formato sha256=<hex> y verificación', () => {
    const signature = signPayload(body, 'secreto-compartido-123');
    expect(signature).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(verifySignature(body, 'secreto-compartido-123', signature)).toBe(true);
  });

  it('cualquier cambio en el cuerpo o el secreto invalida la firma', () => {
    const signature = signPayload(body, 'secreto-compartido-123');
    expect(verifySignature(body.replace('1', '2'), 'secreto-compartido-123', signature)).toBe(false);
    expect(verifySignature(body, 'otro-secreto-xxxxxxx', signature)).toBe(false);
  });
});

describe('Reintentos', () => {
  const now = new Date('2026-10-01T12:00:00Z');

  it('1 min, 5 min, 30 min, 2 h, 12 h y luego ninguno', () => {
    const delays = [1, 2, 3, 4, 5].map((attempt) => (nextAttemptAt(attempt, now)!.getTime() - now.getTime()) / 60_000);
    expect(delays).toEqual([1, 5, 30, 120, 720]);
    expect(nextAttemptAt(WEBHOOK_MAX_ATTEMPTS, now)).toBeNull();
  });
});

describe('URL de webhook (anti-SSRF)', () => {
  it.each([
    ['http://example.com/hook', 'https'],
    ['https://localhost/hook', 'privada'],
    ['https://127.0.0.1/hook', 'privada'],
    ['https://10.0.0.5/hook', 'privada'],
    ['https://192.168.1.10/hook', 'privada'],
    ['https://169.254.169.254/latest/meta-data', 'privada'],
    ['ftp://example.com/hook', 'http(s)'],
  ])('producción rechaza %s', (url, expected) => {
    expect(webhookUrlProblem(url, false)).toContain(expected);
  });

  it('producción acepta https público', () => {
    expect(webhookUrlProblem('https://webhook.site/abc', false)).toBeNull();
  });

  it('desarrollo acepta un receptor local', () => {
    expect(webhookUrlProblem('http://127.0.0.1:4000/hook', true)).toBeNull();
  });
});

describe('SecretBox (AES-256-GCM)', () => {
  const box = SecretBox.fromConfig(undefined, 'un-secreto-de-aplicacion-de-al-menos-32-caracteres');

  it('cifra y descifra; cada cifrado es distinto (IV aleatorio)', () => {
    const a = box.encrypt('mi-secreto');
    expect(a).not.toContain('mi-secreto');
    expect(a).not.toBe(box.encrypt('mi-secreto'));
    expect(box.decrypt(a)).toBe('mi-secreto');
  });

  it('detecta manipulación del texto cifrado', () => {
    const sealed = box.encrypt('mi-secreto');
    const tampered = sealed.slice(0, -4) + (sealed.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    expect(() => box.decrypt(tampered)).toThrow();
  });
});
