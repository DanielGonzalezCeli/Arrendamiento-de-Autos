import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createServer, IncomingHttpHeaders, Server } from 'http';
import { AddressInfo } from 'net';
import { UserRole } from '../../../src/domain/enums';
import { UserJwtGuard } from '../../../src/modules/auth/guards/user-jwt.guard';
import { IdentityClient } from '../../../src/modules/auth/identity-client';
import { testUser } from '../../identity-tokens';

/**
 * Llamada ms-reservas → ms-identidad en cada petición autenticada: el estado y el rol ACTUALES de la cuenta
 * mandan sobre lo que dice el token, y si ms-identidad no responde se usan los datos del token.
 */
describe('UserJwtGuard con ms-identidad', () => {
  let identity: Server;
  let reply: { status: number; body?: unknown } = { status: 200 };
  const calls: IncomingHttpHeaders[] = [];

  async function guardFor(identityUrl: string) {
    // ConfigService a mano: el real lee primero process.env, donde setup-env deja IDENTITY_URL vacía.
    const values: Record<string, string | undefined> = { IDENTITY_URL: identityUrl, IDENTITY_JWT_PUBLIC_KEY: process.env.IDENTITY_JWT_PUBLIC_KEY };
    const client = new IdentityClient({ get: (key: string) => values[key] } as unknown as ConfigService);
    await client.onModuleInit();
    return new UserJwtGuard(client);
  }

  function contextFor(authorization: string, correlationId?: string) {
    const request: Record<string, unknown> = { headers: { authorization, 'x-correlation-id': correlationId } };
    const context = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
    return { context, request };
  }

  beforeAll(async () => {
    identity = createServer((req, res) => {
      calls.push(req.headers);
      res.writeHead(req.url === '/api/auth/me' ? reply.status : 404, { 'Content-Type': 'application/json' }).end(JSON.stringify(reply.body ?? {}));
    });
    await new Promise<void>((resolve) => identity.listen(0, '127.0.0.1', resolve));
  });

  afterAll(() => new Promise((resolve) => identity.close(resolve)));

  const url = () => `http://127.0.0.1:${(identity.address() as AddressInfo).port}`;

  it('usa el rol actual que informa ms-identidad y le reenvía el token y el correlation id', async () => {
    const user = await testUser(UserRole.Customer);
    reply = { status: 200, body: { id: user.id, email: user.email, role: 'ADMIN' } };
    const { context, request } = contextFor(`Bearer ${user.token}`, 'cid-guard-1');
    await expect((await guardFor(url())).canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({ id: user.id, email: user.email, role: UserRole.Admin });
    expect(calls.at(-1)).toMatchObject({ authorization: `Bearer ${user.token}`, 'x-correlation-id': 'cid-guard-1' });
  });

  it('cuenta desactivada en ms-identidad (401) → 401 aunque el token siga vigente', async () => {
    const user = await testUser();
    reply = { status: 401 };
    await expect((await guardFor(url())).canActivate(contextFor(`Bearer ${user.token}`).context)).rejects.toThrow(UnauthorizedException);
  });

  it('si ms-identidad no responde, se usan los datos del token firmado', async () => {
    const user = await testUser(UserRole.Admin);
    const guard = await guardFor('http://127.0.0.1:9'); // puerto cerrado
    const { context, request } = contextFor(`Bearer ${user.token}`);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({ id: user.id, email: user.email, role: UserRole.Admin });
  });

  it('un token inválido se rechaza sin consultar a ms-identidad', async () => {
    const before = calls.length;
    await expect((await guardFor(url())).canActivate(contextFor('Bearer abc.def.ghi').context)).rejects.toThrow(UnauthorizedException);
    expect(calls).toHaveLength(before);
  });
});
