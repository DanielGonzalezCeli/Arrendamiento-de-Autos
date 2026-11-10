import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { IsInternationalPhone, IsPersonName, IsStrictEmail, IsUserPassword } from '../common/contact.decorators';
import { UserRole } from '../users/user.entity';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class RegisterDto {
  @Transform(trim) @IsStrictEmail() email!: string;
  /** bcrypt solo usa los primeros 72 bytes: se limita la longitud. */
  @IsUserPassword() password!: string;
  @Transform(trim) @IsPersonName() firstName!: string;
  @Transform(trim) @IsPersonName() lastName!: string;
  /** Formato internacional E.164 (código de país + número), validado según el país. */
  @IsOptional() @Transform(trim) @IsInternationalPhone() phone?: string;
}

export class LoginDto {
  @Transform(trim) @IsEmail({}, { message: 'Correo electrónico inválido' }) email!: string;
  @IsString() @MinLength(1) @MaxLength(72) password!: string;
}

// ── Panel de administración ──────────────────────────────────────────────────
export class CreateUserDto {
  @Transform(trim) @IsStrictEmail() email!: string;
  @Transform(trim) @IsPersonName() firstName!: string;
  @Transform(trim) @IsPersonName() lastName!: string;
  @IsOptional() @Transform(trim) @IsInternationalPhone() phone?: string | null;
  @IsIn(Object.values(UserRole)) role!: UserRole;
  /** Contraseña inicial: el administrador se la comunica al usuario. */
  @IsUserPassword() password!: string;
}

export class UpdateUserDto {
  @IsOptional() @Transform(trim) @IsStrictEmail() email?: string;
  @IsOptional() @Transform(trim) @IsPersonName() firstName?: string;
  @IsOptional() @Transform(trim) @IsPersonName() lastName?: string;
  @IsOptional() @Transform(trim) @IsInternationalPhone() phone?: string | null;
  @IsOptional() @IsIn(Object.values(UserRole)) role?: UserRole;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class ResetPasswordDto {
  @IsUserPassword() password!: string;
}
