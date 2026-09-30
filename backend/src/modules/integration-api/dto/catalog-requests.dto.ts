import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Length, Matches, Max, Min, ValidateNested,
} from 'class-validator';
import { CONSTANT_KEYS, ConstantKey } from '../../catalog/constants.service';

/**
 * DTOs de request de la API de integración. Nombres, tipos y restricciones copiados de
 * contracts/autos-openapi.yaml (components.schemas). No renombrar: son el contrato.
 */

/** RFC 3339 (format: date-time de OpenAPI): fecha, hora y zona obligatorias. */
export const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const RFC3339_MESSAGE = 'debe ser date-time RFC 3339 con zona horaria (ej. 2026-10-10T10:00:00-05:00)';

export class CoordinatesDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;
}

/** LocationPoint */
export class LocationPointDto {
  @IsOptional()
  @IsString()
  @Length(3, 3)
  airport?: string;

  @IsOptional()
  @IsInt()
  city_id?: number;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => CoordinatesDto)
  coordinates?: CoordinatesDto;
}

export class RouteEndpointDto {
  @Matches(RFC3339, { message: RFC3339_MESSAGE })
  datetime: string;

  @IsObject()
  @ValidateNested()
  @Type(() => LocationPointDto)
  location: LocationPointDto;
}

/** Route (pickup y dropoff requeridos) */
export class RouteDto {
  @IsObject()
  @ValidateNested()
  @Type(() => RouteEndpointDto)
  dropoff: RouteEndpointDto;

  @IsObject()
  @ValidateNested()
  @Type(() => RouteEndpointDto)
  pickup: RouteEndpointDto;
}

/** Booker: country ISO 3166-1 alfa-2 en minúsculas (pattern ^[a-z]{2}$). */
export class BookerDto {
  @Matches(/^[a-z]{2}$/, { message: 'debe cumplir ^[a-z]{2}$ (ISO 3166-1 alfa-2 en minúsculas)' })
  country: string;
}

/** Driver: age 18–99. */
export class DriverDto {
  @IsInt()
  @Min(18)
  @Max(99)
  age: number;
}

export class SearchFiltersDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  car_types?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  transmission?: string[];
}

/** CarSearchRequest */
export class CarSearchRequestDto {
  @IsObject()
  @ValidateNested()
  @Type(() => BookerDto)
  booker: BookerDto;

  @Matches(/^[A-Z]{3}$/, { message: 'debe cumplir ^[A-Z]{3}$ (ISO 4217)' })
  currency: string;

  @IsObject()
  @ValidateNested()
  @Type(() => DriverDto)
  driver: DriverDto;

  @IsObject()
  @ValidateNested()
  @Type(() => RouteDto)
  route: RouteDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => SearchFiltersDto)
  filters?: SearchFiltersDto;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(500)
  maximum_results?: number;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  page?: string;
}

/** Campos comunes de paginación de los endpoints de catálogo. */
class PagedRequestDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maximum_results?: number;

  @IsOptional()
  @IsString()
  page?: string;
}

/** DepotsRequest */
export class DepotsRequestDto extends PagedRequestDto {
  @IsOptional()
  @Matches(RFC3339, { message: RFC3339_MESSAGE })
  last_modified?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];
}

/** DepotScoresRequest */
export class DepotScoresRequestDto extends PagedRequestDto {}

/** CarDetailsRequest */
export class CarDetailsRequestDto extends PagedRequestDto {
  @IsOptional()
  @Matches(RFC3339, { message: RFC3339_MESSAGE })
  last_modified?: string;
}

/** SuppliersRequest: suppliers vacío = todos. */
export class SuppliersRequestDto extends PagedRequestDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  suppliers?: number[];
}

/** CarConstantsRequest */
export class CarConstantsRequestDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];

  @IsOptional()
  @IsArray()
  @IsIn(CONSTANT_KEYS, { each: true })
  constants?: ConstantKey[];
}
