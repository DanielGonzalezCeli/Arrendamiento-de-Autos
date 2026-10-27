import { UnitStatus } from '../../../src/domain/enums';
import { availableUnits, nextMaintenanceKm, unitState, VehicleState } from '../../../src/domain/fleet-state';
import { zonedToUtc, toZoned } from '../../../src/domain/zoned-time';

describe('Máquina de 6 estados del auto (contrato v3)', () => {
  const now = new Date('2026-11-10T15:00:00Z');
  const free = { unitStatus: UnitStatus.Available, blockedNow: false, pickedUp: false, lastReturnedAt: null, nextPickupAt: null };
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);
  const minutesAhead = (m: number) => new Date(now.getTime() + m * 60_000);

  it('sin nada pendiente está DISPONIBLE y reporta 1 unidad', () => {
    expect(unitState(free, now).state).toBe(VehicleState.Available);
    expect(availableUnits(VehicleState.Available)).toBe(1);
  });

  it('cooldown de 2 h tras la devolución: EN_LIMPIEZA hasta los 120 min, luego DISPONIBLE solo', () => {
    const cleaning = unitState({ ...free, lastReturnedAt: minutesAgo(30) }, now);
    expect(cleaning.state).toBe(VehicleState.Cleaning);
    expect(cleaning.cooldownUntil).toEqual(minutesAhead(90));
    expect(availableUnits(cleaning.state)).toBe(0);
    expect(unitState({ ...free, lastReturnedAt: minutesAgo(121) }, now).state).toBe(VehicleState.Available);
  });

  it('reserva asignada: RESERVADO; a menos de 2 h del retiro: LISTO_PARA_ENTREGAR', () => {
    expect(unitState({ ...free, nextPickupAt: minutesAhead(24 * 60) }, now).state).toBe(VehicleState.Reserved);
    expect(unitState({ ...free, nextPickupAt: minutesAhead(60) }, now).state).toBe(VehicleState.ReadyForPickup);
  });

  it('prioridad: taller > entregado > limpieza > reservado', () => {
    expect(unitState({ ...free, unitStatus: UnitStatus.Maintenance, pickedUp: true }, now).state).toBe(VehicleState.Maintenance);
    expect(unitState({ ...free, blockedNow: true }, now).state).toBe(VehicleState.Maintenance);
    expect(unitState({ ...free, pickedUp: true, lastReturnedAt: minutesAgo(10) }, now).state).toBe(VehicleState.PickedUp);
    expect(unitState({ ...free, lastReturnedAt: minutesAgo(10), nextPickupAt: minutesAhead(30) }, now).state).toBe(VehicleState.Cleaning);
  });

  it('próximo mantenimiento: siguiente múltiplo de 10 000 km', () => {
    expect(nextMaintenanceKm(5200)).toBe(10_000);
    expect(nextMaintenanceKm(10_000)).toBe(20_000);
  });
});

describe('Hora local de la agencia', () => {
  it('Ecuador continental es UTC-5', () => {
    expect(zonedToUtc('2026-11-15', '10:00', 'America/Guayaquil')?.toISOString()).toBe('2026-11-15T15:00:00.000Z');
    expect(zonedToUtc('2026-11-15', '10:00:00', 'America/Guayaquil')?.toISOString()).toBe('2026-11-15T15:00:00.000Z');
    expect(toZoned(new Date('2026-11-15T15:00:00Z'), 'America/Guayaquil')).toEqual({ date: '2026-11-15', time: '10:00' });
  });

  it('rechaza fechas u horas inexistentes', () => {
    expect(zonedToUtc('2026-02-30', '10:00', 'America/Guayaquil')).toBeNull();
    expect(zonedToUtc('2026-11-15', '25:00', 'America/Guayaquil')).toBeNull();
    expect(zonedToUtc('15/11/2026', '10:00', 'America/Guayaquil')).toBeNull();
  });
});
