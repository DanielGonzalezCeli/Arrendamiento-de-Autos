import { Global, Module } from '@nestjs/common';
import { RolesGuard } from './guards/roles.guard';
import { UserJwtGuard } from './guards/user-jwt.guard';
import { IdentityClient } from './identity-client';

/**
 * Global: los guards de usuario web se usan desde todos los módulos de la API interna. Desde la fase B el
 * registro, el login y los usuarios viven en ms-identidad; aquí solo se verifican sus tokens.
 */
@Global()
@Module({
  providers: [IdentityClient, UserJwtGuard, RolesGuard],
  exports: [IdentityClient, UserJwtGuard, RolesGuard],
})
export class AuthModule {}
