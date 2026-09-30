import { assertDriverDetails } from '../../../src/domain/order-rules';
import {
  isValidEmail, isValidInternationalPhone, isValidPersonName, normalizeName, normalizePhone,
} from '../../../src/domain/contact-rules';

describe('Nombres y apellidos', () => {
  it.each(['Ana', 'María José', 'Núñez', "O'Connor", 'Pérez-Gil', 'Zoë', 'François', 'Łukasz'])('acepta "%s"', (name) => {
    expect(isValidPersonName(name)).toBe(true);
  });

  it.each(['A', 'Ana3', 'J0sé', 'Ana_Pérez', 'Ana  Pérez', '-Ana', "Ana'", 'Ana@', '12345', 'x'.repeat(61)])('rechaza "%s"', (name) => {
    expect(isValidPersonName(name)).toBe(false);
  });

  it('normaliza espacios', () => {
    expect(normalizeName('  María   José ')).toBe('María José');
  });
});

describe('Correo', () => {
  it.each(['ana@correo.com', 'ana.perez+viajes@mail.co.uk', 'a_b@sub.dominio.ec'])('acepta %s', (email) => {
    expect(isValidEmail(email)).toBe(true);
  });

  it.each(['ana', 'ana@', '@correo.com', 'ana@correo', 'ana@correo.c', 'ana@@correo.com', 'ana..p@correo.com', 'ana perez@correo.com', 'ana@correo.123'])(
    'rechaza %s', (email) => {
      expect(isValidEmail(email)).toBe(false);
    },
  );
});

describe('Teléfono internacional (E.164, dígitos según el país)', () => {
  it.each([
    ['Ecuador celular', '+593991234567'],
    ['Ecuador fijo Quito', '+59322345678'],
    ['Colombia', '+573001234567'],
    ['Perú', '+51912345678'],
    ['EE. UU.', '+12025550143'],
    ['España', '+34612345678'],
    ['Alemania', '+4915123456789'],
    ['México', '+525512345678'],
  ])('acepta %s (%s)', (_country, phone) => {
    expect(isValidInternationalPhone(phone)).toBe(true);
  });

  it.each([
    ['sin código de país', '0991234567'],
    ['Ecuador con dígitos de menos', '+59399123456'],
    ['Ecuador con dígitos de más', '+5939912345678'],
    ['EE. UU. corto', '+1202555014'],
    ['España con dígitos de más', '+346123456789'],
    ['letras', '+593abc123456'],
    ['código de país inexistente', '+999123456789'],
  ])('rechaza %s (%s)', (_label, phone) => {
    expect(isValidInternationalPhone(phone)).toBe(false);
  });

  it('normaliza a E.164', () => {
    expect(normalizePhone('+593 99 123 4567')).toBe('+593991234567');
  });
});

describe('assertDriverDetails', () => {
  const fields = { firstName: 'f', lastName: 'l', email: 'e', phone: 'p' };

  it('reporta cada campo inválido', () => {
    try {
      assertDriverDetails({ firstName: 'Ana2', lastName: '', email: 'ana@', phone: '099' }, fields);
      fail('debió lanzar');
    } catch (error) {
      expect((error as { invalidParams: { name: string }[] }).invalidParams.map((p) => p.name)).toEqual(['f', 'l', 'e', 'p']);
    }
  });

  it('el teléfono es opcional', () => {
    expect(() => assertDriverDetails({ firstName: 'Ana', lastName: 'Pérez', email: 'ana@correo.com' }, fields)).not.toThrow();
  });
});
