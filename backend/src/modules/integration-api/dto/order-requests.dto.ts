import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { DriverDto, RouteDto } from './catalog-requests.dto';

/** DTOs de órdenes del contrato (components.schemas). Nombres snake_case exactos del YAML. */

/** OrderHoldRequest: vehicle_id y search_token requeridos. */
export class OrderHoldRequestDto {
  @IsString()
  @IsNotEmpty()
  vehicle_id: string;

  @IsString()
  @IsNotEmpty()
  search_token: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => DriverDto)
  driver?: DriverDto;
}

/** OrderPreviewRequest */
export class OrderPreviewRequestDto {
  @IsString()
  @IsNotEmpty()
  vehicle_id: string;

  @IsString()
  @IsNotEmpty()
  search_token: string;

  @IsOptional()
  @IsString()
  hold_id?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  extras?: string[];
}

/** driver_details: el contrato no marca requeridos sus campos (la regla de negocio se valida en el servicio). */
export class DriverDetailsDto {
  @IsOptional() @IsString() @MaxLength(60) first_name?: string;
  @IsOptional() @IsString() @MaxLength(60) last_name?: string;
  @IsOptional() @IsString() @MaxLength(120) email?: string;
  @IsOptional() @IsString() @MaxLength(30) phone_number?: string;
}

/** OrderCreateRequest: order_preview_id, payment_reference y driver_details requeridos. */
export class OrderCreateRequestDto {
  @IsString()
  @IsNotEmpty()
  order_preview_id: string;

  @IsString()
  payment_reference: string;

  @IsObject()
  @ValidateNested()
  @Type(() => DriverDetailsDto)
  driver_details: DriverDetailsDto;
}

/** OrderModifyRequest: todo opcional. */
export class OrderModifyRequestDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  extras_to_add?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  extras_to_remove?: string[];

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => RouteDto)
  route?: RouteDto;
}
