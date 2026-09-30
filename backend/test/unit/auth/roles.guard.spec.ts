import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../../src/domain/enums';
import { RolesGuard } from '../../../src/modules/auth/guards/roles.guard';

function contextWith(user: { role: UserRole } | undefined): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const reflectorReturning = (roles?: UserRole[]) =>
    ({ getAllAndOverride: () => roles }) as unknown as Reflector;

  it('sin @Roles, cualquier usuario autenticado pasa', () => {
    expect(new RolesGuard(reflectorReturning()).canActivate(contextWith({ role: UserRole.Customer }))).toBe(true);
  });

  it('ADMIN accede a un endpoint @Roles(ADMIN)', () => {
    expect(new RolesGuard(reflectorReturning([UserRole.Admin])).canActivate(contextWith({ role: UserRole.Admin }))).toBe(true);
  });

  it('CUSTOMER en un endpoint @Roles(ADMIN) → 403', () => {
    const guard = new RolesGuard(reflectorReturning([UserRole.Admin]));
    expect(() => guard.canActivate(contextWith({ role: UserRole.Customer }))).toThrow(ForbiddenException);
  });
});
