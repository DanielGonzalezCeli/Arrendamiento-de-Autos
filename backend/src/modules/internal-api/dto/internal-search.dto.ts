import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { Transmission } from '../../../domain/enums';
import { RFC3339 } from '../../integration-api/dto/catalog-requests.dto';

/**
 * Búsqueda desde el marketplace. Más cómoda para la UX que CarSearchRequest: la ubicación es una
 * agencia, una ciudad o un aeropuerto (uno de ellos). Si no se indica devolución, es la misma ubicación.
 */
export class InternalSearchDto {
  @ApiPropertyOptional({ example: 1 }) @IsOptional() @IsInt() pickupDepotId?: number;
  @ApiPropertyOptional({ example: 1 }) @IsOptional() @IsInt() pickupCityId?: number;
  @ApiPropertyOptional({ example: 'UIO' }) @IsOptional() @Matches(/^[A-Za-z]{3}$/) pickupAirport?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() dropoffDepotId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() dropoffCityId?: number;
  @ApiPropertyOptional() @IsOptional() @Matches(/^[A-Za-z]{3}$/) dropoffAirport?: string;

  @ApiProperty({ example: '2026-10-10T10:00:00-05:00' })
  @Matches(RFC3339, { message: 'pickupAt debe ser fecha y hora con zona horaria' })
  pickupAt: string;

  @ApiProperty({ example: '2026-10-13T10:00:00-05:00' })
  @Matches(RFC3339, { message: 'dropoffAt debe ser fecha y hora con zona horaria' })
  dropoffAt: string;

  @ApiProperty({ example: 30 }) @IsInt() @Min(18) @Max(99) driverAge: number;

  @ApiPropertyOptional({ example: 'USD', default: 'USD' })
  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @ApiPropertyOptional({ example: ['SUV'] }) @IsOptional() @IsArray() @IsString({ each: true }) carTypes?: string[];

  @ApiPropertyOptional({ enum: Transmission, isArray: true })
  @IsOptional()
  @IsArray()
  @IsIn(Object.values(Transmission), { each: true })
  transmissions?: Transmission[];
}
