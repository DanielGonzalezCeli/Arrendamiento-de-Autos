import { BUSINESS_RULES, MINUTE_MS } from './business-rules';
import { FuelPolicy, FuelType } from './enums';

/**
 * RN28 — inspección de devolución y cargos adicionales (sin IVA; la factura lo agrega).
 *  - Combustible: octavos de tanque faltantes × galones del tanque × precio del galón del combustible del
 *    modelo (Extra, Súper o Diésel), según la política: lleno a lleno compara contra tanque lleno, "mismo
 *    nivel" contra el nivel de la entrega y prepago no cobra. Los eléctricos no usan gasolina: el faltante
 *    de batería (en octavos = 12,5 %) × kWh de la batería × precio del kWh.
 *  - Limpieza: tarifa normal (sucio) o profunda (muy sucio).
 *  - Daños nuevos: costo estimado hasta el deducible; con la cobertura total (CDW) el cliente no paga daños.
 *  - Retraso: días extra con la misma tolerancia de la facturación (RN04), a la tarifa diaria base.
 */

export const LITERS_PER_GALLON = 3.785411784;
export const TANK_EIGHTHS = 8;

export enum FuelGrade {
  Extra = 'EXTRA',
  Super = 'SUPER',
  Diesel = 'DIESEL',
  Electric = 'ELECTRIC',
}

/**
 * Energía que usa un modelo según su motor: eléctrico → ELECTRIC (con batería); diésel → DIESEL;
 * gasolina e híbrido → la gasolina elegida (Extra por defecto). Un motor de combustión nunca puede quedar como
 * ELECTRIC ni un eléctrico como gasolina: así el cargo de devolución siempre cobra lo que el auto realmente usa.
 */
export function energyFor(fuelType: FuelType, requested?: FuelGrade | null): { grade: FuelGrade; error?: string } {
  if (fuelType === FuelType.Electric) return { grade: FuelGrade.Electric };
  if (requested === FuelGrade.Electric) return { grade: FuelGrade.Extra, error: 'Solo un vehículo eléctrico puede cargar electricidad' };
  if (fuelType === FuelType.Diesel) return { grade: FuelGrade.Diesel };
  if (requested === FuelGrade.Diesel) return { grade: FuelGrade.Extra, error: 'Un motor a gasolina no usa diésel' };
  return { grade: requested ?? FuelGrade.Extra };
}

export enum Cleanliness {
  Clean = 'CLEAN',
  Dirty = 'DIRTY',
  VeryDirty = 'VERY_DIRTY',
}

export enum DamageSeverity {
  Minor = 'MINOR',
  Moderate = 'MODERATE',
  Severe = 'SEVERE',
}

export interface Damage {
  zone: string;
  severity: DamageSeverity;
  description: string;
  estimatedCost: number;
}

export interface ChargeSettings {
  fuelPrices: Record<FuelGrade, number>;
  refuelServiceFee: number;
  cleaningBasic: number;
  cleaningDeep: number;
  damageDeductible: number;
}

export interface ReturnChargeInput {
  fuelPolicy: FuelPolicy;
  fuelGrade: FuelGrade;
  tankLiters: number;
  /** Eléctricos: capacidad de la batería (kWh). */
  batteryKwh?: number | null;
  /** Nivel registrado en la entrega (octavos); null = no se registró (se asume lleno). */
  pickupFuelEighths: number | null;
  returnFuelEighths: number;
  cleanliness: Cleanliness;
  damages: Damage[];
  hasFullCoverage: boolean;
  pickupAt: Date;
  scheduledDropoffAt: Date;
  returnedAt: Date;
  dailyRate: number;
}

export interface ChargeLine {
  code: string;
  description: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface ReturnChargeResult {
  lines: ChargeLine[];
  subtotal: number;
  notes: string[];
  missingEighths: number;
  lateDays: number;
  hasSevereDamage: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeReturnCharges(input: ReturnChargeInput, settings: ChargeSettings): ReturnChargeResult {
  const lines: ChargeLine[] = [];
  const notes: string[] = [];

  // Combustible
  const reference = input.fuelPolicy === FuelPolicy.FullToFull ? TANK_EIGHTHS : input.pickupFuelEighths ?? TANK_EIGHTHS;
  const missingEighths = input.fuelPolicy === FuelPolicy.Prepaid ? 0 : Math.max(reference - input.returnFuelEighths, 0);
  if (missingEighths > 0 && input.fuelGrade === FuelGrade.Electric) {
    const kwh = round2((missingEighths / TANK_EIGHTHS) * (input.batteryKwh ?? 0));
    const price = settings.fuelPrices[FuelGrade.Electric];
    lines.push({
      code: 'CHARGE_ELECTRIC',
      description: `Carga eléctrica: falta ${(missingEighths * 12.5).toLocaleString('es-EC')} % de batería (${kwh.toLocaleString('es-EC')} kWh)`,
      quantity: kwh, unitPrice: price, subtotal: round2(kwh * price),
    });
    if (settings.refuelServiceFee > 0) {
      lines.push({ code: 'REFUEL_SERVICE', description: 'Servicio de recarga', quantity: 1, unitPrice: settings.refuelServiceFee, subtotal: settings.refuelServiceFee });
    }
  } else if (missingEighths > 0) {
    const gallons = round2((missingEighths / TANK_EIGHTHS) * (input.tankLiters / LITERS_PER_GALLON));
    const price = settings.fuelPrices[input.fuelGrade];
    lines.push({
      code: `FUEL_${input.fuelGrade}`,
      description: `Combustible ${FUEL_LABEL[input.fuelGrade]}: faltan ${missingEighths}/8 de tanque (${gallons.toFixed(2)} gal)`,
      quantity: gallons, unitPrice: price, subtotal: round2(gallons * price),
    });
    if (settings.refuelServiceFee > 0) {
      lines.push({ code: 'REFUEL_SERVICE', description: 'Servicio de recarga de combustible', quantity: 1, unitPrice: settings.refuelServiceFee, subtotal: settings.refuelServiceFee });
    }
  } else if (input.fuelPolicy === FuelPolicy.Prepaid) {
    notes.push('Combustible prepagado: no se cobra el nivel de devolución.');
  }

  // Limpieza
  if (input.cleanliness === Cleanliness.Dirty) {
    lines.push({ code: 'CLEANING', description: 'Limpieza normal (interior sucio)', quantity: 1, unitPrice: settings.cleaningBasic, subtotal: settings.cleaningBasic });
  } else if (input.cleanliness === Cleanliness.VeryDirty) {
    lines.push({ code: 'CLEANING_DEEP', description: 'Limpieza profunda', quantity: 1, unitPrice: settings.cleaningDeep, subtotal: settings.cleaningDeep });
  }

  // Daños
  const damageCost = round2(input.damages.reduce((s, d) => s + Math.max(d.estimatedCost, 0), 0));
  if (damageCost > 0) {
    if (input.hasFullCoverage) {
      notes.push(`Daños por ${damageCost.toFixed(2)} USD cubiertos por la cobertura total (CDW).`);
    } else {
      const charged = Math.min(damageCost, settings.damageDeductible);
      lines.push({
        code: 'DAMAGE',
        description: `Daños (${input.damages.length}): ${input.damages.map((d) => d.zone).join(', ')}${charged < damageCost ? ` · tope del deducible ${settings.damageDeductible.toFixed(2)}` : ''}`,
        quantity: 1, unitPrice: charged, subtotal: charged,
      });
    }
  }

  // Retraso
  const lateDays = lateDaysBetween(input.pickupAt, input.scheduledDropoffAt, input.returnedAt);
  if (lateDays > 0) {
    lines.push({ code: 'LATE_RETURN', description: `Devolución tardía: ${lateDays} día(s) adicional(es)`, quantity: lateDays, unitPrice: input.dailyRate, subtotal: round2(lateDays * input.dailyRate) });
  }

  return {
    lines, notes, missingEighths, lateDays,
    subtotal: round2(lines.reduce((s, l) => s + l.subtotal, 0)),
    hasSevereDamage: input.damages.some((d) => d.severity === DamageSeverity.Severe),
  };
}

/** Días extra: días facturables reales − reservados, con la misma tolerancia de RN04. */
export function lateDaysBetween(pickupAt: Date, scheduledDropoffAt: Date, returnedAt: Date): number {
  if (returnedAt <= scheduledDropoffAt) return 0;
  const days = (a: Date, b: Date) => Math.max(1, Math.ceil(Math.max((b.getTime() - a.getTime()) / MINUTE_MS - BUSINESS_RULES.BILLING_GRACE_MINUTES, 0) / (24 * 60)));
  return Math.max(days(pickupAt, returnedAt) - days(pickupAt, scheduledDropoffAt), 0);
}

export const FUEL_LABEL: Record<FuelGrade, string> = { [FuelGrade.Extra]: 'Extra', [FuelGrade.Super]: 'Súper', [FuelGrade.Diesel]: 'Diésel', [FuelGrade.Electric]: 'Eléctrico' };
