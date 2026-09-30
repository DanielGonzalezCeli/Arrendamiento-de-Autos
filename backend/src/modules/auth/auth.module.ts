import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { USER_JWT_AUDIENCE, USER_JWT_ISSUER } from './auth-user';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RolesGuard } from './guards/roles.guard';
import { UserJwtGuard } from './guards/user-jwt.guard';

/** Global: los guards de usuario web se usan desde todos los módulos de la API interna. */
@Global()
@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('USER_JWT_SECRET'),
        signOptions: {
          expiresIn: config.get<string>('USER_JWT_EXPIRES_IN') ?? '2h',
          issuer: USER_JWT_ISSUER,
          audience: USER_JWT_AUDIENCE,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, UserJwtGuard, RolesGuard],
  exports: [JwtModule, UserJwtGuard, RolesGuard],
})
export class AuthModule {}
