import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';
import { UserRole } from '../../../domain/enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const NAME_PATTERN = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]+$/;

export class RegisterDto {
  @ApiProperty({ example: 'ana.perez@correo.ec' })
  @Transform(trim)
  @IsEmail({}, { message: 'Correo electrónico inválido' })
  @MaxLength(120)
  email: string;

  /** bcrypt solo usa los primeros 72 bytes: se limita la longitud. */
  @ApiProperty({ example: 'MiClave2026', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(72)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, { message: 'La contraseña debe tener letras y números' })
  password: string;

  @ApiProperty({ example: 'Ana' })
  @Transform(trim)
  @IsString()
  @Length(2, 60)
  @Matches(NAME_PATTERN, { message: 'Nombre: solo letras' })
  firstName: string;

  @ApiProperty({ example: 'Pérez' })
  @Transform(trim)
  @IsString()
  @Length(2, 60)
  @Matches(NAME_PATTERN, { message: 'Apellido: solo letras' })
  lastName: string;

  @ApiPropertyOptional({ example: '0991234567' })
  @IsOptional()
  @Transform(trim)
  @Matches(/^\+?[0-9]{7,15}$/, { message: 'Teléfono inválido' })
  phone?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'cliente@rutalibre.ec' })
  @Transform(trim)
  @IsEmail({}, { message: 'Correo electrónico inválido' })
  email: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password: string;
}

export class PublicUserDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() email: string;
  @ApiProperty() firstName: string;
  @ApiProperty() lastName: string;
  @ApiProperty({ nullable: true, type: String }) phone: string | null;
  @ApiProperty({ enum: UserRole }) role: UserRole;
}

export class AuthResponseDto {
  @ApiProperty() accessToken: string;
  @ApiProperty({ example: 'Bearer' }) tokenType: 'Bearer';
  @ApiProperty({ type: PublicUserDto }) user: PublicUserDto;
}
