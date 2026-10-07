import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { IsInternationalPhone, IsPersonName, IsStrictEmail, IsUserPassword } from '../../../common/validation/contact.decorators';
import { UserRole } from '../../../domain/enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class RegisterDto {
  @ApiProperty({ example: 'ana.perez@correo.ec' })
  @Transform(trim)
  @IsStrictEmail()
  email: string;

  /** bcrypt solo usa los primeros 72 bytes: se limita la longitud. */
  @ApiProperty({ example: 'MiClave2026', minLength: 8 })
  @IsUserPassword()
  password: string;

  @ApiProperty({ example: 'Ana' })
  @Transform(trim)
  @IsPersonName()
  firstName: string;

  @ApiProperty({ example: 'Pérez' })
  @Transform(trim)
  @IsPersonName()
  lastName: string;

  /** Formato internacional E.164 (código de país + número), validado según el país. */
  @ApiPropertyOptional({ example: '+593991234567' })
  @IsOptional()
  @Transform(trim)
  @IsInternationalPhone()
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
