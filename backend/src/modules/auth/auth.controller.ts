import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthUser } from './auth-user';
import { AuthResult, AuthService } from './auth.service';
import { CurrentUser } from './decorators';
import { AuthResponseDto, LoginDto, PublicUserDto, RegisterDto } from './dto/auth.dto';
import { UserJwtGuard } from './guards/user-jwt.guard';

/** API interna: /api/auth/* (usuarios del marketplace). */
@ApiTags('Autenticación')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Registrar un cliente' })
  @ApiResponse({ status: 201, type: AuthResponseDto })
  @ApiResponse({ status: 409, description: 'El correo ya está registrado' })
  register(@Body() dto: RegisterDto): Promise<AuthResult> {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iniciar sesión' })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas' })
  login(@Body() dto: LoginDto): Promise<AuthResult> {
    return this.auth.login(dto);
  }

  @Get('me')
  @UseGuards(UserJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Usuario autenticado' })
  @ApiResponse({ status: 200, type: PublicUserDto })
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }
}
