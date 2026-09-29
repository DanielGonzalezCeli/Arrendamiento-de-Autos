import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * API-first: el contrato oficial no se toca. Este test falla si alguien edita
 * contracts/autos-openapi.yaml sin actualizar deliberadamente contracts/UPSTREAM.md.
 */
describe('Contrato autos-openapi.yaml', () => {
  const contractsDir = resolve(__dirname, '..', '..', '..', 'contracts');

  it('coincide con el SHA-256 registrado en UPSTREAM.md', () => {
    // Se normaliza CRLF→LF: el hash registrado es el del archivo canónico del repositorio oficial (LF),
    // y así el test da el mismo resultado en Windows y en Linux (CI).
    const contract = readFileSync(resolve(contractsDir, 'autos-openapi.yaml'), 'utf8').replace(/\r\n/g, '\n');
    const upstream = readFileSync(resolve(contractsDir, 'UPSTREAM.md'), 'utf8');

    const registered = upstream.match(/`([0-9a-f]{64})`/)?.[1];
    const actual = createHash('sha256').update(contract, 'utf8').digest('hex');

    expect(registered).toBeDefined();
    expect(actual).toBe(registered);
  });
});
