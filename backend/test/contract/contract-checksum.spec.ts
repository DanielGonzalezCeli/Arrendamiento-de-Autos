import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * API-first: los contratos oficiales no se tocan. Este test falla si alguien edita un archivo de contracts/
 * sin actualizar deliberadamente su SHA-256 en contracts/UPSTREAM.md.
 */
describe('Contratos oficiales (contracts/UPSTREAM.md)', () => {
  const contractsDir = resolve(__dirname, '..', '..', '..', 'contracts');
  const upstream = readFileSync(resolve(contractsDir, 'UPSTREAM.md'), 'utf8');

  it.each(['autos-openapi.yaml', 'autos-openapi-v3.yaml', 'inventory.proto'])('%s coincide con el SHA-256 registrado', (file) => {
    // Se normaliza CRLF→LF: el hash registrado es el del archivo canónico (LF),
    // y así el test da el mismo resultado en Windows y en Linux (CI).
    const content = readFileSync(resolve(contractsDir, file), 'utf8').replace(/\r\n/g, '\n');
    const row = upstream.split('\n').find((line) => line.startsWith(`| \`${file}\``));
    const registered = row?.match(/`([0-9a-f]{64})`/)?.[1];
    const actual = createHash('sha256').update(content, 'utf8').digest('hex');

    expect(registered).toBeDefined();
    expect(actual).toBe(registered);
  });
});
