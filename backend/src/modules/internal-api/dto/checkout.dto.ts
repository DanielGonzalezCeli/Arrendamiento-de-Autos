import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEmail, IsEnum, IsInt, IsObject, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateNested } from 'class-validator';
import { IsInternationalPhone, IsPersonName, IsStrictEmail } from '../../../common/validation/contact.decorators';
import { PAYMENT_TOKEN } from '../../../domain/payment-simulator';
import { RFC3339 } from '../../integration-api/dto/catalog-requests.dto';
import { BuyerIdType } from '../../../domain/sri';

export class CheckoutHoldDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() searchToken: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() vehicleId: string;
}

export class CheckoutPreviewDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() searchToken: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() vehicleId: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() holdId?: string;
  @ApiPropertyOptional({ example: ['GPS'] }) @IsOptional() @IsArray() @IsString({ each: true }) extras?: string[];
}

export class CheckoutDriverDto {
  @ApiProperty({ example: 'Ana' }) @IsPersonName() firstName: string;
  @ApiProperty({ example: 'Pérez' }) @IsPersonName() lastName: string;
  @ApiProperty({ example: 'ana.perez@correo.ec' }) @IsStrictEmail() email: string;
  @ApiPropertyOptional({ example: '+593991234567' }) @IsOptional() @IsInternationalPhone() phone?: string;
}

/** Datos de facturación (RN27). Consumidor final solo hasta USD 50, como exige el SRI. */
export class CheckoutBillingDto {
  @ApiProperty({ enum: BuyerIdType, example: BuyerIdType.Cedula, description: '04 RUC · 05 cédula · 06 pasaporte · 07 consumidor final' })
  @IsEnum(BuyerIdType) idType: BuyerIdType;
  @ApiPropertyOptional({ example: '1710034065' }) @IsOptional() @IsString() @MaxLength(20) idNumber?: string;
  @ApiPropertyOptional({ example: 'Ana Pérez' }) @IsOptional() @IsString() @MaxLength(300) name?: string;
  @ApiPropertyOptional({ example: 'Av. 6 de Diciembre N24-253, Quito' }) @IsOptional() @IsString() @MaxLength(300) address?: string;
  @ApiPropertyOptional({ example: 'ana@correo.ec' }) @IsOptional() @IsEmail() @MaxLength(120) email?: string;
}

export class CheckoutConfirmDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() orderPreviewId: string;

  @ApiProperty({ type: CheckoutDriverDto })
  @IsObject()
  @ValidateNested()
  @Type(() => CheckoutDriverDto)
  driver: CheckoutDriverDto;

  /** Token de la pasarela simulada: el número y el CVV de la tarjeta nunca llegan al backend. */
  @ApiProperty({ example: 'tok_sim_visa_4242_k3j9x2m1q8' })
  @Matches(PAYMENT_TOKEN, { message: 'token de pago inválido' })
  paymentToken: string;

  @ApiPropertyOptional({ type: CheckoutBillingDto, description: 'Obligatorio si el total supera USD 50' })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => CheckoutBillingDto)
  billing?: CheckoutBillingDto;
}

export class ModifyMyReservationDto {
  @ApiPropertyOptional({ example: ['CDW'] }) @IsOptional() @IsArray() @IsString({ each: true }) extrasToAdd?: string[];
  @ApiPropertyOptional({ example: ['GPS'] }) @IsOptional() @IsArray() @IsString({ each: true }) extrasToRemove?: string[];
  @ApiPropertyOptional() @IsOptional() @Matches(RFC3339) pickupAt?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(RFC3339) dropoffAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() pickupDepotId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() dropoffDepotId?: number;
}
