/**
 * RN27 — Comprobantes electrónicos del SRI (Ecuador), esquema offline v1.1.0.
 * Reglas puras: identificación del comprador, clave de acceso de 49 dígitos (módulo 11) y numeración.
 * Los comprobantes se generan en AMBIENTE DE PRUEBAS y no se envían al SRI: autorizarlos exige un RUC
 * real y un certificado de firma electrónica (.p12), fuera del alcance del proyecto (como el pago simulado).
 */

/** Emisor (datos de ejemplo; el RUC cumple el algoritmo de una sociedad privada). */
export const SRI_EMITTER = {
  ruc: '1793216544001',
  businessName: 'RUTALIBRE RENTA DE AUTOS S.A.',
  tradeName: 'RutaLibre',
  headOffice: 'Av. Amazonas N34-120 y Av. Naciones Unidas, Quito',
  establishment: '001',
  emissionPoint: '001',
  requiredToKeepAccounts: 'SI',
  /** 1 = pruebas, 2 = producción. */
  environment: '1',
  /** 1 = emisión normal. */
  emissionType: '1',
} as const;

/** Tabla 6 del SRI: tipos de identificación del comprador. */
export enum BuyerIdType {
  Ruc = '04',
  Cedula = '05',
  Passport = '06',
  FinalConsumer = '07',
}

export const FINAL_CONSUMER = { id: '9999999999999', name: 'CONSUMIDOR FINAL' } as const;

/** Por encima de este total el SRI exige identificar al comprador (no se admite consumidor final). */
export const FINAL_CONSUMER_MAX_TOTAL = 50;

/** Tabla 3: códigos de documento. */
export enum SriDocType {
  Invoice = '01',
  CreditNote = '04',
}

/** Tabla 17: IVA 15 % (código de impuesto 2, código de porcentaje 4). */
export const VAT_15 = { code: '2', percentageCode: '4', rate: 15 } as const;

/** Tabla 24: forma de pago "tarjeta de crédito". */
export const PAYMENT_CREDIT_CARD = '19';

const PROVINCES = 24;

/** Cédula ecuatoriana: 10 dígitos, provincia 01–24 (o 30), tercer dígito < 6 y verificador módulo 10. */
export function isValidCedula(value: string): boolean {
  if (!/^\d{10}$/.test(value)) return false;
  const province = Number(value.slice(0, 2));
  if (!((province >= 1 && province <= PROVINCES) || province === 30)) return false;
  if (Number(value[2]) >= 6) return false;
  const sum = [...value.slice(0, 9)].reduce((acc, d, i) => {
    const product = Number(d) * (i % 2 === 0 ? 2 : 1);
    return acc + (product > 9 ? product - 9 : product);
  }, 0);
  return (10 - (sum % 10)) % 10 === Number(value[9]);
}

/** RUC: persona natural (cédula + establecimiento), sociedad privada (3.er dígito 9) o pública (6). */
export function isValidRuc(value: string): boolean {
  if (!/^\d{13}$/.test(value) || value.endsWith('000')) return false;
  const third = Number(value[2]);
  if (third < 6) return isValidCedula(value.slice(0, 10));
  if (third === 9) return mod11Check(value.slice(0, 9), [4, 3, 2, 7, 6, 5, 4, 3, 2]) === Number(value[9]);
  if (third === 6) return mod11Check(value.slice(0, 8), [3, 2, 7, 6, 5, 4, 3, 2]) === Number(value[8]) && value.slice(9) !== '0000';
  return false;
}

function mod11Check(digits: string, weights: number[]): number {
  const sum = [...digits].reduce((acc, d, i) => acc + Number(d) * weights[i], 0);
  const rest = 11 - (sum % 11);
  return rest === 11 ? 0 : rest;
}

export interface BuyerInput {
  idType: BuyerIdType;
  idNumber?: string | null;
  name?: string | null;
  address?: string | null;
  email?: string | null;
}

export interface Buyer {
  idType: BuyerIdType;
  idNumber: string;
  name: string;
  address: string | null;
  email: string | null;
}

export type BuyerFieldErrors = Partial<Record<'idType' | 'idNumber' | 'name', string>>;

/** Valida y normaliza el comprador; devuelve errores por campo (vacío = válido). */
export function normalizeBuyer(input: BuyerInput, total: number): { buyer: Buyer | null; errors: BuyerFieldErrors } {
  const errors: BuyerFieldErrors = {};
  if (!Object.values(BuyerIdType).includes(input.idType)) return { buyer: null, errors: { idType: 'Tipo de identificación no válido' } };
  if (input.idType === BuyerIdType.FinalConsumer) {
    if (total > FINAL_CONSUMER_MAX_TOTAL) {
      errors.idType = `El SRI no permite facturar a consumidor final montos mayores a USD ${FINAL_CONSUMER_MAX_TOTAL}: ingresa cédula, RUC o pasaporte`;
      return { buyer: null, errors };
    }
    return { buyer: { idType: input.idType, idNumber: FINAL_CONSUMER.id, name: FINAL_CONSUMER.name, address: null, email: clean(input.email) }, errors };
  }
  const idNumber = (input.idNumber ?? '').replace(/[\s-]/g, '').toUpperCase();
  if (input.idType === BuyerIdType.Cedula && !isValidCedula(idNumber)) errors.idNumber = 'Cédula no válida';
  if (input.idType === BuyerIdType.Ruc && !isValidRuc(idNumber)) errors.idNumber = 'RUC no válido';
  if (input.idType === BuyerIdType.Passport && !/^[A-Z0-9]{5,20}$/.test(idNumber)) errors.idNumber = 'Pasaporte no válido (5 a 20 letras o números)';
  const name = clean(input.name);
  if (!name || name.length < 3) errors.name = 'Ingresa el nombre o la razón social';
  if (Object.keys(errors).length) return { buyer: null, errors };
  return { buyer: { idType: input.idType, idNumber, name: name!.toUpperCase().slice(0, 300), address: clean(input.address)?.slice(0, 300) ?? null, email: clean(input.email) }, errors };
}

function clean(value?: string | null): string | null {
  const v = value?.trim().replace(/\s+/g, ' ');
  return v ? v : null;
}

/** Secuencial de 9 dígitos y número visible 001-001-000000123. */
export function documentNumber(sequential: number): { sequential: string; number: string } {
  const seq = String(sequential).padStart(9, '0');
  return { sequential: seq, number: `${SRI_EMITTER.establishment}-${SRI_EMITTER.emissionPoint}-${seq}` };
}

/**
 * Clave de acceso (49 dígitos): fecha ddmmaaaa + tipo + RUC + ambiente + serie + secuencial
 * + código numérico (8) + tipo de emisión + dígito verificador módulo 11 (pesos 2..7 desde la derecha).
 */
export function accessKey(params: { issuedOn: string; docType: SriDocType; sequential: string; numericCode: string }): string {
  const [y, m, d] = params.issuedOn.split('-');
  const base = `${d}${m}${y}${params.docType}${SRI_EMITTER.ruc}${SRI_EMITTER.environment}${SRI_EMITTER.establishment}${SRI_EMITTER.emissionPoint}`
    + `${params.sequential}${params.numericCode}${SRI_EMITTER.emissionType}`;
  if (!/^\d{48}$/.test(base)) throw new Error('Clave de acceso mal formada');
  return base + accessKeyCheckDigit(base);
}

export function accessKeyCheckDigit(digits48: string): number {
  let weight = 2;
  let sum = 0;
  for (let i = digits48.length - 1; i >= 0; i--) {
    sum += Number(digits48[i]) * weight;
    weight = weight === 7 ? 2 : weight + 1;
  }
  const rest = 11 - (sum % 11);
  return rest === 11 ? 0 : rest === 10 ? 1 : rest;
}

/** Desglosa un importe con IVA incluido en base imponible + IVA (centavos exactos). */
export function splitVatIncluded(total: number): { base: number; vat: number } {
  const totalCents = Math.round(total * 100);
  const baseCents = Math.round(totalCents / (1 + VAT_15.rate / 100));
  return { base: baseCents / 100, vat: (totalCents - baseCents) / 100 };
}
