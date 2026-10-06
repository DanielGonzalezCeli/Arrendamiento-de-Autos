import { randomBytes } from 'crypto';
import { DomainError, ProblemCode } from './domain-error';

/**
 * Pasarela de pagos SIMULADA del marketplace ("RutaPay, entorno de pruebas").
 *
 * El cobro real pertenece al Payment API del Booking Hub (fuera de nuestro dominio, RN18). Para la web
 * se simula una pasarela con el mismo flujo que una real:
 *  1. El navegador valida la tarjeta y la "tokeniza": el número y el CVV NUNCA llegan a nuestro backend.
 *  2. El backend autoriza el token y obtiene una referencia de pago, en la misma transacción en la que
 *     crea la reserva (si la reserva falla, la autorización se anula con el rollback).
 *
 * Tarjetas de prueba (como en Stripe): terminación 0002 → rechazada por el banco; 9995 → fondos
 * insuficientes; cualquier otra tarjeta válida → aprobada.
 */

export const CARD_BRANDS = ['visa', 'mastercard', 'amex', 'diners', 'discover'] as const;
export type CardBrand = (typeof CARD_BRANDS)[number];

/** tok_sim_<marca>_<últimos 4>_<nonce> */
export const PAYMENT_TOKEN = /^tok_sim_(visa|mastercard|amex|diners|discover)_(\d{4})_[a-z0-9]{8,32}$/;

const DECLINES: Record<string, string> = {
  '0002': 'El banco emisor rechazó la tarjeta. Prueba con otra tarjeta.',
  '9995': 'Fondos insuficientes. Prueba con otra tarjeta.',
};

export interface PaymentAuthorization {
  reference: string;
  brand: CardBrand;
  last4: string;
}

export function authorizeSimulatedPayment(token: string): PaymentAuthorization {
  const match = PAYMENT_TOKEN.exec(token);
  if (!match) {
    throw DomainError.validation('Token de pago inválido', [{ name: 'paymentToken', reason: 'formato inválido' }]);
  }
  const brand = match[1] as CardBrand;
  const last4 = match[2];
  const declined = DECLINES[last4];
  if (declined) {
    throw new DomainError(ProblemCode.PaymentNotAuthorized, 402, 'Pago rechazado', declined);
  }
  // Cumple el formato de payment_reference del contrato: 8–64 caracteres [A-Za-z0-9_-]
  const reference = `PAY-${brand.toUpperCase()}-${last4}-${randomBytes(5).toString('hex').toUpperCase()}`;
  return { reference, brand, last4 };
}

/** Datos visibles del medio de pago a partir de la referencia (sin guardar datos de la tarjeta). */
export function describePaymentReference(reference: string): { brand: CardBrand; last4: string } | null {
  const match = /^PAY-([A-Z]+)-(\d{4})-[A-Z0-9]+$/.exec(reference);
  if (!match) return null;
  const brand = match[1].toLowerCase() as CardBrand;
  return CARD_BRANDS.includes(brand) ? { brand, last4: match[2] } : null;
}
