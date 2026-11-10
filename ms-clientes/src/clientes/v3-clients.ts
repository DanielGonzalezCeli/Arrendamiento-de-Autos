import { InvalidParam, V3Code, V3Error } from '../common/problem-details-v3';
import { Client, ClientSource } from './client.entity';
import { ClientInput, isValidIdentification, normalizeIdentification } from './clients.service';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SOURCES: ClientSource[] = ['BOOKING', 'WEB', 'MOSTRADOR'];

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
    throw new V3Error(400, V3Code.MalformedRequest, 'Faltan criterios', 'Envía email o identificacion',
      [{ name: 'email', reason: 'email o identificacion es obligatorio' }]);
  }
  return { email: email?.toLowerCase() ?? null, identification: id ? normalizeIdentification(id) : null };
}

/** POST /clientes: { nombre, email, identificacion, telefono, licencia } (también en inglés). Lector tolerante. */
export function parseClientCreate(raw: unknown): Omit<ClientInput, 'source'> & { source?: ClientSource } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new V3Error(400, V3Code.MalformedRequest, 'Solicitud mal formada', 'El cuerpo debe ser un objeto JSON');
  }
  const body = raw as Record<string, unknown>;
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
  if (invalid.length) throw new V3Error(422, V3Code.InvalidPayload, 'Datos del cliente inválidos', 'Revisa los campos del cliente', invalid);
  const source = text(body.origen ?? body.source, 20)?.toUpperCase() as ClientSource | undefined;
  return {
    fullName: fullName!,
    email: email!.toLowerCase(),
    identification: identification!,
    phone: text(pick(body, 'telefono', 'phone'), 30),
    licenseNumber: text(pick(body, 'licencia', 'license_number'), 40),
    source: source && SOURCES.includes(source) ? source : undefined,
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
