import { BUSINESS_RULES, MINUTE_MS } from './business-rules';
import { UnitStatus } from './enums';

/** Máquina de 6 estados de un auto concreto (contrato v3, EstadoVehiculoEnum · Cátedra RDA2 §5). */
export enum VehicleState {
  Available = 'DISPONIBLE',
  Reserved = 'RESERVADO',
  ReadyForPickup = 'LISTO_PARA_ENTREGAR',
  PickedUp = 'ENTREGADO',
  Cleaning = 'EN_LIMPIEZA',
  Maintenance = 'EN_MANTENIMIENTO',
}

/** Hechos de una unidad física (placa) en un instante. El estado se deriva de ellos, no se guarda. */
export interface UnitFacts {
  unitStatus: UnitStatus;
  /** Bloqueo del panel (taller, revisión) que cubre el instante actual. */
  blockedNow: boolean;
  /** Tiene un alquiler entregado y aún no devuelto. */
  pickedUp: boolean;
  /** Última devolución registrada de esta unidad. */
  lastReturnedAt: Date | null;
  /** Retiro de la próxima reserva confirmada asignada a esta unidad (sin empezar). */
  nextPickupAt: Date | null;
}

export interface UnitStateResult {
  state: VehicleState;
  /** Fin del cooldown de limpieza, si está en EN_LIMPIEZA. */
  cooldownUntil: Date | null;
}

/**
 * Deriva el estado operativo. Prioridad: taller > entregado > limpieza > reservado > disponible.
 * Al calcularse en cada lectura, el cooldown de 2 h vence solo: no hace falta un proceso que lo "libere".
 */
export function unitState(facts: UnitFacts, now: Date): UnitStateResult {
  if (facts.unitStatus !== UnitStatus.Available || facts.blockedNow) return { state: VehicleState.Maintenance, cooldownUntil: null };
  if (facts.pickedUp) return { state: VehicleState.PickedUp, cooldownUntil: null };

  const cooldownUntil = cleaningCooldownUntil(facts.lastReturnedAt);
  if (cooldownUntil && cooldownUntil > now) return { state: VehicleState.Cleaning, cooldownUntil };

  if (facts.nextPickupAt) {
    const minutesToPickup = (facts.nextPickupAt.getTime() - now.getTime()) / MINUTE_MS;
    return {
      state: minutesToPickup <= BUSINESS_RULES.READY_FOR_PICKUP_WINDOW_MINUTES ? VehicleState.ReadyForPickup : VehicleState.Reserved,
      cooldownUntil: null,
    };
  }
  return { state: VehicleState.Available, cooldownUntil: null };
}

export function cleaningCooldownUntil(returnedAt: Date | null): Date | null {
  return returnedAt ? new Date(returnedAt.getTime() + BUSINESS_RULES.CLEANING_BUFFER_MINUTES * MINUTE_MS) : null;
}

/** available_units del inventory.proto: 1 solo si se puede rentar. */
export function availableUnits(state: VehicleState): 0 | 1 {
  return state === VehicleState.Available ? 1 : 0;
}

/** Próximo umbral de mantenimiento preventivo (múltiplo de MAINTENANCE_INTERVAL_KM por encima del odómetro). */
export function nextMaintenanceKm(mileage: number): number {
  const interval = BUSINESS_RULES.MAINTENANCE_INTERVAL_KM;
  return (Math.floor(mileage / interval) + 1) * interval;
}
