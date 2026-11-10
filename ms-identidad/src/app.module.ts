import { randomUUID } from 'crypto';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import { stdTimeFunctions } from 'pino';

import { ReservasClient } from './admin/reservas.client';
import { UsersAdminController } from './admin/users-admin.controller';
import { AuthController, JwksController } from './auth/auth.controller';
import { RolesGuard } from './auth/guards/roles.guard';
import { UserJwtGuard } from './auth/guards/user-jwt.guard';
import { TokenService } from './auth/token.service';
import { validateEnv } from './config/env.validation';
import { buildTypeOrmOptions } from './config/typeorm.config';
import { HealthController } from './health/health.controller';
import { User } from './users/user.entity';
import { UsersService } from './users/users.service';

/** Campos que nunca deben aparecer en los logs. */
const REDACTED_PATHS = ['req.headers.authorization', 'req.headers.cookie', 'req.body.password'];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env', validate: validateEnv }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL') ?? 'info',
          timestamp: stdTimeFunctions.isoTime,
          redact: REDACTED_PATHS,
          // Traza distribuida: el mismo X-Correlation-Id que puso el gateway (o uno nuevo si se llama directo).
          genReqId: (req, res) => {
            const id = (req.headers['x-correlation-id'] as string) || `cid-idn-${randomUUID().slice(0, 8)}`;
            res.setHeader('X-Correlation-Id', id);
            return id;
          },
          customProps: () => ({ service: 'ms-identidad' }),
        },
      }),
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ ...buildTypeOrmOptions(config.getOrThrow<string>('DATABASE_URL')), autoLoadEntities: true }),
    }),
    TypeOrmModule.forFeature([User]),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
  ],
  controllers: [AuthController, JwksController, UsersAdminController, HealthController],
  providers: [TokenService, UsersService, ReservasClient, UserJwtGuard, RolesGuard],
})
export class AppModule {}
