import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsObject, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateNested } from 'class-validator';
import { RFC3339 } from '../../integration-api/dto/catalog-requests.dto';

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
  @ApiProperty({ example: 'Ana' }) @IsString() @MaxLength(60) firstName: string;
  @ApiProperty({ example: 'Pérez' }) @IsString() @MaxLength(60) lastName: string;
  @ApiProperty({ example: 'ana.perez@correo.ec' }) @IsString() @MaxLength(120) email: string;
  @ApiPropertyOptional({ example: '0991234567' }) @IsOptional() @IsString() @MaxLength(30) phone?: string;
}

export class CheckoutConfirmDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() orderPreviewId: string;

  @ApiProperty({ type: CheckoutDriverDto })
  @IsObject()
  @ValidateNested()
  @Type(() => CheckoutDriverDto)
  driver: CheckoutDriverDto;
}

export class ModifyMyReservationDto {
  @ApiPropertyOptional({ example: ['CDW'] }) @IsOptional() @IsArray() @IsString({ each: true }) extrasToAdd?: string[];
  @ApiPropertyOptional({ example: ['GPS'] }) @IsOptional() @IsArray() @IsString({ each: true }) extrasToRemove?: string[];
  @ApiPropertyOptional() @IsOptional() @Matches(RFC3339) pickupAt?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(RFC3339) dropoffAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() pickupDepotId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() dropoffDepotId?: number;
}
