import { Body, Controller, Get, Header, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthResult, UsersService } from '../users/users.service';
import { LoginDto, RegisterDto } from './auth.dto';
import { CurrentUser } from './guards/roles.guard';
import { AuthUser, UserJwtGuard } from './guards/user-jwt.guard';
import { TokenService } from './token.service';

/** Intentos de login por IP y minuto (mitiga fuerza bruta). */
const LOGIN_ATTEMPTS_PER_MINUTE = 10;

/** /api/auth/*: mismas rutas y respuestas que tenía el monolito; el gateway las enruta a este servicio. */
@Controller('api/auth')
export class AuthController {
  constructor(private readonly users: UsersService) {}

  @Post('register')
  register(@Body() dto: RegisterDto): Promise<AuthResult> {
    return this.users.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: LOGIN_ATTEMPTS_PER_MINUTE, ttl: 60_000 } })
  login(@Body() dto: LoginDto): Promise<AuthResult> {
    return this.users.login(dto);
  }

  /** También lo usa ms-reservas en cada petición autenticada para saber si la cuenta sigue activa y su rol actual. */
  @Get('me')
  @UseGuards(UserJwtGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.users.me(user.id);
  }
}

/** Clave pública con la que los demás servicios verifican los JWT de usuario (RFC 7517). */
@Controller('.well-known')
export class JwksController {
  constructor(private readonly tokens: TokenService) {}

  @Get('jwks.json')
  @Header('Cache-Control', 'public, max-age=300')
  jwks() {
    return this.tokens.jwks();
  }
}
