import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { CreateUserDto, ResetPasswordDto, UpdateUserDto } from '../auth/auth.dto';
import { CurrentUser, Roles, RolesGuard } from '../auth/guards/roles.guard';
import { AuthUser, UserJwtGuard } from '../auth/guards/user-jwt.guard';
import { UserRole } from '../users/user.entity';
import { AdminRequestContext, UsersService } from '../users/users.service';

/** /api/admin/users/*: gestión de cuentas desde el panel. Solo ADMIN (la protección está aquí, no solo en la web). */
@Controller('api/admin/users')
@UseGuards(UserJwtGuard, RolesGuard)
@Roles(UserRole.Admin)
export class UsersAdminController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@Req() req: Request, @CurrentUser() user: AuthUser) {
    return this.users.list(context(req, user));
  }

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() user: AuthUser) {
    return this.users.update(id, dto, user.id);
  }

  @Post(':id/password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto) {
    return this.users.resetPassword(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @Req() req: Request, @CurrentUser() user: AuthUser) {
    await this.users.remove(id, context(req, user));
  }
}

function context(req: Request, user: AuthUser): AdminRequestContext {
  return {
    actingUserId: user.id,
    authorization: req.headers.authorization!,
    correlationId: req.headers['x-correlation-id'] as string | undefined,
  };
}
