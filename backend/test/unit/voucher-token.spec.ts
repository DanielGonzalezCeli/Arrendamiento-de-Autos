import { VoucherSigner } from '../../src/modules/vouchers/voucher-token';

describe('VoucherSigner (links firmados del voucher)', () => {
  const signer = new VoucherSigner('secreto-de-prueba-con-mas-de-32-caracteres');
  const id = '1b4e28ba-2fa1-4d2b-9f5e-4a1c2d3e4f50';

  it('es determinista, corto y apto para URL', () => {
    const token = signer.sign(id);
    expect(token).toBe(signer.sign(id));
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('verifica solo el token de esa reserva y con ese secreto', () => {
    const token = signer.sign(id);
    expect(signer.verify(id, token)).toBe(true);
    expect(signer.verify('2b4e28ba-2fa1-4d2b-9f5e-4a1c2d3e4f50', token)).toBe(false);
    expect(new VoucherSigner('otro-secreto-distinto-de-mas-de-32-caracteres').verify(id, token)).toBe(false);
  });

  it('rechaza tokens ausentes, de otro largo o con un carácter cambiado', () => {
    const token = signer.sign(id);
    expect(signer.verify(id, undefined)).toBe(false);
    expect(signer.verify(id, token.slice(1))).toBe(false);
    expect(signer.verify(id, `${token[0] === 'A' ? 'B' : 'A'}${token.slice(1)}`)).toBe(false);
  });
});
