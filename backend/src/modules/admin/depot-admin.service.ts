import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { DomainError, ProblemCode } from '../../domain/domain-error';
import { DepotOpeningHours } from '../catalog/entities/depot-opening-hours.entity';
import { Depot } from '../catalog/entities/depot.entity';
import { DomainEventType } from '../events/domain-events';
import { OutboxService } from '../events/outbox.service';
import { DepotDto, OpeningHoursDto, UpdateDepotDto } from './dto/admin.dto';

/**
 * Agencias (depots) con su horario semanal. Cada alta o cambio emite DEPOT_UPDATE (evento del contrato)
 * en la misma transacción, para que el Booking Hub refresque su copia de POST /depots.
 */
@Injectable()
export class DepotAdminService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly outbox: OutboxService,
  ) {}

  list() {
    return this.dataSource.getRepository(Depot).find({
      relations: { city: true, supplier: true, openingHours: true }, order: { id: 'ASC' },
    });
  }

  create(dto: DepotDto) {
    assertHours(dto.openingHours);
    return this.dataSource.transaction(async (m) => {
      const { openingHours, ...data } = dto;
      const depot = await m.save(Depot, data);
      await this.replaceHours(m, depot.id, openingHours);
      return this.afterChange(m, depot.id, 'created');
    });
  }

  update(id: number, dto: UpdateDepotDto) {
    if (dto.openingHours) assertHours(dto.openingHours);
    return this.dataSource.transaction(async (m) => {
      const depot = Number.isInteger(id) ? await m.findOne(Depot, { where: { id }, lock: { mode: 'pessimistic_write' } }) : null;
      if (!depot) throw DomainError.notFound('La agencia no existe');
      if (dto.active === false && depot.active) await assertNoFutureReservations(m, id);

      const { openingHours, ...data } = dto;
      if (Object.keys(data).length) await m.update(Depot, id, data);
      if (openingHours) await this.replaceHours(m, id, openingHours);
      return this.afterChange(m, id, dto.active === false ? 'deactivated' : 'updated');
    });
  }

  private async replaceHours(m: EntityManager, depotId: number, hours: OpeningHoursDto[]) {
    await m.delete(DepotOpeningHours, { depotId });
    if (hours.length) await m.save(DepotOpeningHours, hours.map((h) => ({ ...h, depotId })));
    // Cambiar solo el horario también es un cambio de la agencia (last_modified de /depots).
    await m.update(Depot, depotId, { updatedAt: new Date() });
  }

  private async afterChange(m: EntityManager, depotId: number, change: 'created' | 'updated' | 'deactivated') {
    const depot = await m.findOneOrFail(Depot, { where: { id: depotId }, relations: { city: true, supplier: true, openingHours: true } });
    await this.outbox.record(m, DomainEventType.DepotUpdate, String(depot.id), {
      depot_id: depot.id, name: depot.name, active: depot.active, change,
    });
    return depot;
  }
}

function assertHours(hours: OpeningHoursDto[]) {
  const invalid = hours.find((h) => h.opens >= h.closes);
  if (invalid) {
    throw DomainError.validation('La hora de apertura debe ser anterior a la de cierre', [
      { name: `openingHours[${invalid.weekday}]`, reason: `${invalid.opens}–${invalid.closes}` },
    ]);
  }
}

async function assertNoFutureReservations(m: EntityManager, depotId: number) {
  const [{ count }] = await m.query(
    `SELECT count(*)::int AS count FROM reservations
      WHERE (pickup_depot_id = $1 OR dropoff_depot_id = $1) AND status IN ('PENDING','CONFIRMED')
        AND rental_status <> 'RETURNED' AND dropoff_at > now()`,
    [depotId],
  );
  if (count > 0) {
    throw new DomainError(ProblemCode.ValidationFailed, 409, 'Conflicto', `La agencia tiene ${count} reserva(s) activa(s); no se puede desactivar`);
  }
}
