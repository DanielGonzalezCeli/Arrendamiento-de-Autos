import { createHmac, hkdfSync, timingSafeEqual } from 'crypto';

/** 22 caracteres base64url = 132 bits: imposible de adivinar, corto para caber en un QR legible. */
const TOKEN_LENGTH = 22;

/**
 * Firma de los links de voucher. Quien tiene el link (o escanea el QR) ve el voucher sin iniciar
 * sesión, pero no puede deducir el de otra reserva: el token es un HMAC del id interno de la reserva.
 * La clave se deriva (HKDF) del secreto de la app con un contexto propio, así no se reutiliza la de los JWT.
 */
export class VoucherSigner {
  private readonly key: Buffer;

  constructor(appSecret: string) {
    this.key = Buffer.from(hkdfSync('sha256', appSecret, 'rutalibre', 'voucher-link-v1', 32));
  }

  sign(reservationId: string): string {
    return createHmac('sha256', this.key).update(reservationId).digest('base64url').slice(0, TOKEN_LENGTH);
  }

  verify(reservationId: string, token: unknown): boolean {
    if (typeof token !== 'string' || token.length !== TOKEN_LENGTH) return false;
    return timingSafeEqual(Buffer.from(this.sign(reservationId)), Buffer.from(token));
  }
}
