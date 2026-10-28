import {
  accessKey, accessKeyCheckDigit, BuyerIdType, documentNumber, FINAL_CONSUMER, isValidCedula, isValidRuc, normalizeBuyer,
  SRI_EMITTER, SriDocType, splitVatIncluded,
} from '../../../src/domain/sri';

describe('RN27 — comprobantes electrónicos SRI', () => {
  describe('cédula (módulo 10)', () => {
    it.each(['1710034065', '0926687856', '1713175071'])('válida: %s', (c) => expect(isValidCedula(c)).toBe(true));
    it.each([
      ['dígito verificador', '1710034066'],
      ['provincia 25', '2510034065'],
      ['tercer dígito ≥ 6', '1770034065'],
      ['longitud', '171003406'],
      ['letras', '17100340A5'],
    ])('inválida por %s', (_, c) => expect(isValidCedula(c)).toBe(false));
  });

  describe('RUC', () => {
    it('persona natural: cédula válida + 001', () => expect(isValidRuc('1710034065001')).toBe(true));
    it('sociedad privada (módulo 11): el RUC del emisor es válido', () => expect(isValidRuc(SRI_EMITTER.ruc)).toBe(true));
    it('sociedad pública (tercer dígito 6)', () => expect(isValidRuc('1760001550001')).toBe(true));
    it.each(['1710034065000', '1793216549001', '179321654400', '1780034065001'])('inválido: %s', (r) => expect(isValidRuc(r)).toBe(false));
  });

  describe('comprador', () => {
    it('consumidor final hasta USD 50', () => {
      const { buyer, errors } = normalizeBuyer({ idType: BuyerIdType.FinalConsumer, email: 'a@b.ec' }, 50);
      expect(errors).toEqual({});
      expect(buyer).toMatchObject({ idNumber: FINAL_CONSUMER.id, name: FINAL_CONSUMER.name });
    });
    it('consumidor final por encima de USD 50 → error', () => {
      expect(normalizeBuyer({ idType: BuyerIdType.FinalConsumer }, 50.01).errors.idType).toMatch(/consumidor final/);
    });
    it('normaliza cédula, nombre en mayúsculas y valida campos', () => {
      expect(normalizeBuyer({ idType: BuyerIdType.Cedula, idNumber: '171003406-5', name: '  ana  pérez ' }, 120).buyer)
        .toMatchObject({ idNumber: '1710034065', name: 'ANA PÉREZ' });
      expect(normalizeBuyer({ idType: BuyerIdType.Ruc, idNumber: '123', name: '' }, 120).errors).toEqual({ idNumber: 'RUC no válido', name: expect.any(String) });
      expect(normalizeBuyer({ idType: BuyerIdType.Passport, idNumber: 'ab 12345', name: 'John Doe' }, 120).buyer?.idNumber).toBe('AB12345');
    });
  });

  describe('numeración y clave de acceso', () => {
    it('número 001-001-000000123', () => expect(documentNumber(123)).toEqual({ sequential: '000000123', number: '001-001-000000123' }));

    it('49 dígitos con la estructura del SRI', () => {
      const key = accessKey({ issuedOn: '2026-10-28', docType: SriDocType.Invoice, sequential: '000000123', numericCode: '12345678' });
      expect(key).toHaveLength(49);
      expect(key.slice(0, 8)).toBe('28102026');
      expect(key.slice(8, 10)).toBe('01');
      expect(key.slice(10, 23)).toBe(SRI_EMITTER.ruc);
      expect(key[23]).toBe('1');
      expect(key.slice(24, 30)).toBe('001001');
      expect(key.slice(30, 39)).toBe('000000123');
      expect(key.slice(39, 47)).toBe('12345678');
      expect(key[47]).toBe('1');
      expect(Number(key[48])).toBe(accessKeyCheckDigit(key.slice(0, 48)));
    });

    it('dígito verificador módulo 11 (residuos 11 → 0 y 10 → 1)', () => {
      // Ejemplo de la ficha técnica del SRI
      expect(accessKeyCheckDigit('41261533')).toBe(6);
      expect(accessKeyCheckDigit('0'.repeat(48))).toBe(0);
    });
  });

  it('IVA incluido → base + IVA que suman exacto', () => {
    expect(splitVatIncluded(115)).toEqual({ base: 100, vat: 15 });
    const { base, vat } = splitVatIncluded(127.65);
    expect(Math.round((base + vat) * 100)).toBe(12765);
  });
});
