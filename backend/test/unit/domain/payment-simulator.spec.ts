import { DomainError, ProblemCode } from '../../../src/domain/domain-error';
import { authorizeSimulatedPayment, describePaymentReference } from '../../../src/domain/payment-simulator';

describe('Pasarela de pagos simulada (RN18)', () => {
  it('aprueba una tarjeta válida y devuelve una referencia con el formato del contrato', () => {
    const auth = authorizeSimulatedPayment('tok_sim_visa_4242_a1b2c3d4');
    expect(auth).toMatchObject({ brand: 'visa', last4: '4242' });
    expect(auth.reference).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(describePaymentReference(auth.reference)).toEqual({ brand: 'visa', last4: '4242' });
  });

  it.each([
    ['0002', /rechazó la tarjeta/],
    ['9995', /Fondos insuficientes/],
  ])('rechaza la tarjeta de prueba terminada en %s con 402 PAYMENT_NOT_AUTHORIZED', (last4, message) => {
    const call = () => authorizeSimulatedPayment(`tok_sim_mastercard_${last4}_a1b2c3d4`);
    expect(call).toThrow(DomainError);
    expect(call).toThrow(expect.objectContaining({ code: ProblemCode.PaymentNotAuthorized, status: 402 }));
    expect(call).toThrow(message);
  });

  it.each([
    '4242424242424242',
    'tok_sim_visa_4242',
    'tok_live_visa_4242_a1b2c3d4',
    'tok_sim_unknown_4242_a1b2c3d4',
  ])('no acepta datos de tarjeta en claro ni tokens mal formados: %s', (token) => {
    expect(() => authorizeSimulatedPayment(token)).toThrow(expect.objectContaining({ code: ProblemCode.ValidationFailed, status: 400 }));
  });

  it('las referencias antiguas sin tarjeta no rompen la vista', () => {
    expect(describePaymentReference('SIM-0A1B2C3D4E5F6A7B')).toBeNull();
  });
});
