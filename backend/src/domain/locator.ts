import { randomInt } from 'crypto';

/** Sin caracteres ambiguos (0/O, 1/I/L) para que el cliente pueda dictarlo por teléfono. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LENGTH = 6;

/** Localizador tipo PNR: "<CÓDIGO_PROVEEDOR>-<6 caracteres>", ej. ANDES-7K2Q9M. */
export function generateLocator(supplierCode: string): string {
  let suffix = '';
  for (let i = 0; i < LENGTH; i++) suffix += ALPHABET[randomInt(ALPHABET.length)];
  return `${supplierCode.toUpperCase()}-${suffix}`;
}
