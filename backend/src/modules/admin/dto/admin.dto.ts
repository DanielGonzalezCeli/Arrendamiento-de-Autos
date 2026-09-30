import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique, IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min,
  ValidateNested,
} from 'class-validator';
import { IsInternationalPhone } from '../../../common/validation/contact.decorators';
import { DEPOT_SERVICE_CODES } from '../../catalog/constants.service';
import { ExtraType, FuelPolicy, FuelType, OrderStatus, RentalStatus, Transmission, UnitStatus, UserRole } from '../../../domain/enums';
import { RFC3339 } from '../../integration-api/dto/catalog-requests.dto';

/** DTOs del panel de administración (API interna /api/admin). */

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);
/** Foto: URL https externa o archivo servido por el frontend (/cars/…). */
const IMAGE_URL = /^(https:\/\/\S+|\/[\w./-]+)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const CURRENT_YEAR = new Date().getFullYear();

// ── Modelos (oferta comercial = vehicle_id del contrato) ─────────────────────
export class VehicleModelDto {
  @ApiProperty() @IsInt() supplierId: number;
  @ApiProperty({ format: 'uuid' }) @IsUUID() categoryId: string;
  @ApiProperty({ example: 'Toyota' }) @Transform(trim) @IsString() @Length(2, 50) make: string;
  @ApiProperty({ example: 'Yaris' }) @Transform(trim) @IsString() @Length(1, 60) model: string;
  @ApiPropertyOptional({ example: 'EDAR' }) @IsOptional() @Transform(upper) @Matches(/^[A-Z]{4}$/, { message: 'código ACRISS de 4 letras' }) acrissCode?: string;
  @ApiProperty({ enum: Transmission }) @IsEnum(Transmission) transmission: Transmission;
  @ApiProperty({ enum: FuelType }) @IsEnum(FuelType) fuelType: FuelType;
  @ApiProperty({ enum: FuelPolicy }) @IsEnum(FuelPolicy) fuelPolicy: FuelPolicy;
  @ApiProperty() @IsInt() @Min(1) @Max(15) seats: number;
  @ApiProperty() @IsInt() @Min(2) @Max(6) doors: number;
  @ApiProperty() @IsInt() @Min(0) @Max(10) bagCapacity: number;
  @ApiProperty() @IsBoolean() airConditioning: boolean;
  @ApiPropertyOptional() @IsOptional() @Matches(IMAGE_URL, { message: 'URL https o ruta /cars/archivo.jpg' }) imageUrl?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string | null;
  /** Publicado = visible en el marketplace y en /search del Hub. */
  @ApiProperty() @IsBoolean() published: boolean;
}
export class UpdateVehicleModelDto extends PartialType(VehicleModelDto) {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

// ── Flota (unidades físicas con placa) ───────────────────────────────────────
export class FleetUnitDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() vehicleModelId: string;
  @ApiProperty() @IsInt() depotId: number;
  /** Placa ecuatoriana: 3 letras, guion y 3–4 dígitos (ej. PBA-1234). */
  @ApiProperty({ example: 'PBA-1234' }) @Transform(upper) @Matches(/^[A-Z]{3}-\d{3,4}$/, { message: 'formato de placa ABC-1234' }) plate: string;
  @ApiProperty() @IsInt() @Min(1990) @Max(CURRENT_YEAR + 1) year: number;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @Matches(/^[\p{L} ]{3,30}$/u, { message: 'color: solo letras' }) color?: string | null;
  @ApiProperty() @IsInt() @Min(0) @Max(2_000_000) mileage: number;
  @ApiProperty({ enum: UnitStatus }) @IsEnum(UnitStatus) status: UnitStatus;
}
export class UpdateFleetUnitDto extends PartialType(FleetUnitDto) {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

export class VehicleBlockDto {
  @ApiProperty({ example: '2026-11-01T08:00:00-05:00' }) @Matches(RFC3339) startsAt: string;
  @ApiProperty({ example: '2026-11-03T18:00:00-05:00' }) @Matches(RFC3339) endsAt: string;
  @ApiProperty({ example: 'Mantenimiento de 10.000 km' }) @Transform(trim) @IsString() @Length(3, 200) reason: string;
}

// ── Catálogos simples ────────────────────────────────────────────────────────
export class CategoryDto {
  @ApiProperty({ example: 'SUV' }) @Transform(upper) @Matches(/^[A-Z_]{3,20}$/, { message: 'MAYÚSCULAS y _ (3–20)' }) code: string;
  @ApiProperty() @Transform(trim) @IsString() @Length(2, 60) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) description?: string | null;
  @ApiProperty() @IsInt() @Min(18) @Max(99) minDriverAge: number;
  @ApiProperty() @IsInt() @Min(0) @Max(100) sortOrder: number;
}
export class UpdateCategoryDto extends PartialType(CategoryDto) {}

export class SupplierDto {
  @ApiProperty({ example: 'ANDES' }) @Transform(upper) @Matches(/^[A-Z]{2,10}$/, { message: 'solo letras mayúsculas (2–10)' }) code: string;
  @ApiProperty() @Transform(trim) @IsString() @Length(2, 100) name: string;
  @ApiPropertyOptional() @IsOptional() @Matches(IMAGE_URL) logoUrl?: string | null;
  @ApiProperty() @IsBoolean() active: boolean;
}
export class UpdateSupplierDto extends PartialType(SupplierDto) {}

export class ExtraDto {
  @ApiProperty({ example: 'GPS' }) @Transform(upper) @Matches(/^[A-Z_]{2,30}$/, { message: 'MAYÚSCULAS y _ (2–30)' }) code: string;
  @ApiProperty() @Transform(trim) @IsString() @Length(2, 80) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) description?: string | null;
  @ApiProperty({ enum: ExtraType }) @IsEnum(ExtraType) type: ExtraType;
  @ApiProperty() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1000) pricePerDay: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(10000) maxPrice?: number | null;
  @ApiProperty() @IsBoolean() active: boolean;
}
export class UpdateExtraDto extends PartialType(ExtraDto) {}

export class RateDto {
  @ApiProperty() @IsInt() supplierId: number;
  @ApiProperty({ format: 'uuid' }) @IsUUID() categoryId: string;
  @ApiProperty({ example: 45 }) @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) @Max(10000) dailyRate: number;
  /** Las tarifas se definen en la moneda base (RN13). */
  @ApiProperty({ example: '2026-01-01' }) @Matches(DATE) validFrom: string;
  @ApiProperty({ example: '2027-12-31' }) @Matches(DATE) validTo: string;
}
export class UpdateRateDto extends PartialType(RateDto) {}

export class CityDto {
  @ApiProperty({ example: 'Manta' }) @Transform(trim) @Matches(/^[\p{L} .'-]{2,80}$/u, { message: 'solo letras' }) name: string;
  @ApiProperty({ example: 'ec' }) @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value)) @Matches(/^[a-z]{2}$/) countryCode: string;
}

export class OpeningHoursDto {
  @ApiProperty({ minimum: 0, maximum: 6 }) @IsInt() @Min(0) @Max(6) weekday: number;
  @ApiProperty({ example: '08:00' }) @Matches(TIME) opens: string;
  @ApiProperty({ example: '19:00' }) @Matches(TIME) closes: string;
}

export class DepotDto {
  @ApiProperty() @IsInt() supplierId: number;
  @ApiProperty() @IsInt() cityId: number;
  @ApiProperty() @Transform(trim) @IsString() @Length(3, 120) name: string;
  @ApiProperty() @Transform(trim) @IsString() @Length(5, 200) address: string;
  @ApiPropertyOptional({ example: 'UIO' }) @IsOptional() @Transform(upper) @Matches(/^[A-Z]{3}$/, { message: 'código IATA de 3 letras' }) airportCode?: string | null;
  @ApiProperty() @IsNumber() @Min(-90) @Max(90) latitude: number;
  @ApiProperty() @IsNumber() @Min(-180) @Max(180) longitude: number;
  @ApiPropertyOptional({ example: '+59322000001' }) @IsOptional() @IsInternationalPhone() phone?: string | null;
  @ApiProperty({ type: [String], enum: DEPOT_SERVICE_CODES }) @IsArray() @ArrayUnique() @IsIn(DEPOT_SERVICE_CODES, { each: true }) services: string[];
  @ApiProperty() @IsBoolean() active: boolean;
  @ApiProperty({ type: [OpeningHoursDto] })
  @IsArray()
  @ArrayUnique((h: OpeningHoursDto) => h.weekday, { message: 'un horario por día' })
  @ValidateNested({ each: true })
  @Type(() => OpeningHoursDto)
  openingHours: OpeningHoursDto[];
}
export class UpdateDepotDto extends PartialType(DepotDto) {}

// ── Reservas ─────────────────────────────────────────────────────────────────
export class ReservationFiltersDto {
  @ApiPropertyOptional({ enum: OrderStatus }) @IsOptional() @IsEnum(OrderStatus) status?: OrderStatus;
  @ApiPropertyOptional({ enum: RentalStatus }) @IsOptional() @IsEnum(RentalStatus) rentalStatus?: RentalStatus;
  @ApiPropertyOptional({ description: 'Recogida desde (YYYY-MM-DD)' }) @IsOptional() @Matches(DATE) from?: string;
  @ApiPropertyOptional({ description: 'Recogida hasta (YYYY-MM-DD)' }) @IsOptional() @Matches(DATE) to?: string;
  @ApiPropertyOptional({ description: 'Localizador, correo o apellido' }) @IsOptional() @Transform(trim) @IsString() @MaxLength(80) q?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() depotId?: number;
}

export class PickupDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Placa elegida; si se omite se asigna la primera libre' }) @IsOptional() @IsUUID() fleetUnitId?: string;
}

export class ReturnDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(2_000_000) mileage?: number;
}

// ── Usuarios ─────────────────────────────────────────────────────────────────
export class UpdateUserDto {
  @ApiPropertyOptional({ enum: UserRole }) @IsOptional() @IsIn(Object.values(UserRole)) role?: UserRole;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}
