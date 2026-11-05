import { v3Error, V3Code } from '../../common/problem-details/problem-details-v3';
import { InvalidParam } from '../../domain/domain-error';
import { Client } from '../clients/client.entity';
import { ClientInput, isValidIdentification, normalizeIdentification } from '../clients/clients.service';
import { assertJsonObject } from './v3-request';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const text = (value: unknown, max: number): string | null => {
  if (typeof value === 'number') value = String(value);
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim().slice(0, max);
};

const pick = (source: Record<string, unknown>, ...names: string[]) =>
  names.map((n) => source[n]).find((v) => v !== undefined && v !== null);

/** GET /clientes?email=…&identificacion=…: al menos uno de los dos. */
export function parseClientLookup(query: Record<string, unknown>): { email: string | null; identification: string | null } {
  const email = text(pick(query, 'email', 'correo'), 120);
  const id = text(pick(query, 'identificacion', 'identification', 'cedula'), 30);
  if (!email && !id) {
    throw v3Error(400, V3Code.MalformedRequest, 'Faltan criterios', 'Envía email o identificacion',
      [{ name: 'email', reason: 'email o identificacion es obligatorio' }]);
  }
  return { email: email?.toLowerCase() ?? null, identification: id ? normalizeIdentification(id) : null };
}

/** POST /clientes: { nombre, email, identificacion, telefono, licencia } (también en inglés). */
export function parseClientCreate(raw: unknown): Omit<ClientInput, 'source'> {
  const body = assertJsonObject(raw);
  const fullName = text(pick(body, 'nombre', 'full_name', 'name'), 120);
  const email = text(pick(body, 'email', 'correo'), 120);
  const idRaw = text(pick(body, 'identificacion', 'identification', 'cedula'), 30);
  const identification = idRaw ? normalizeIdentification(idRaw) : null;
  const invalid: InvalidParam[] = [];
  if (!fullName || fullName.length < 3) invalid.push({ name: 'nombre', reason: 'es obligatorio (mínimo 3 caracteres)' });
  if (!email) invalid.push({ name: 'email', reason: 'es obligatorio' });
  else if (!EMAIL.test(email)) invalid.push({ name: 'email', reason: 'correo inválido' });
  if (!identification) invalid.push({ name: 'identificacion', reason: 'es obligatoria' });
  else if (!isValidIdentification(identification)) invalid.push({ name: 'identificacion', reason: 'de 5 a 20 letras o dígitos' });
  if (invalid.length) throw v3Error(422, V3Code.InvalidPayload, 'Datos del cliente inválidos', 'Revisa los campos del cliente', invalid);
  return {
    fullName: fullName!,
    email: email!.toLowerCase(),
    identification: identification!,
    phone: text(pick(body, 'telefono', 'phone'), 30),
    licenseNumber: text(pick(body, 'licencia', 'license_number'), 40),
  };
}

export function toClientResponse(client: Client) {
  return {
    client_id: client.id,
    nombre: client.fullName,
    email: client.email,
    identificacion: client.identification,
    telefono: client.phone,
    licencia: client.licenseNumber,
    origen: client.source,
    creado_en: new Date(client.createdAt).toISOString(),
  };
}
