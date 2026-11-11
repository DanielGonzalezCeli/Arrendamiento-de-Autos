import { parseFleetEvent } from '../src/messaging/fleet-event';
import { HttpStockTransport } from '../src/stock/booking-stock.client';
import { needsPush, nextTimestamp, slotId } from '../src/stock/stock-message';

describe('inventory.proto — PushStockUpdate', () => {
  it('slot_id canónico slot-YYYYMMDD-HHMM', () => {
    expect(slotId('2026-11-15', '10:00')).toBe('slot-20261115-1000');
  });

  it('solo se reenvía si cambia la disponibilidad o la reserva', () => {
    const free = { vehicle_id: 'a', state: 'DISPONIBLE', available_units: 1 as const, date: '2026-11-10', time_slot: '10:30' };
    expect(needsPush(free, { units: 1, date: '2026-11-10', timeSlot: '10:00' })).toBe(false);
    expect(needsPush(free, { units: null, date: null, timeSlot: null })).toBe(true);
    expect(needsPush({ ...free, available_units: 0 }, { units: 0, date: '2026-11-12', timeSlot: '10:00' })).toBe(true);
    expect(needsPush({ ...free, available_units: 0, date: '2026-11-12', time_slot: '10:00' }, { units: 0, date: '2026-11-12', timeSlot: '10:00' })).toBe(false);
  });

  it('timestamp estrictamente creciente', () => {
    expect(nextTimestamp(1000, 500)).toBe(1001);
    expect(nextTimestamp(1000, 5000)).toBe(5000);
  });

  it('push REST: X-API-Key y solo los campos que acepta Booking (time_slot DEFAULT, sin extras)', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, acknowledged: true, message: 'ok', source: 'HTTP_REST' }), { status: 200 }));
    try {
      const message = { service_id: 'NODE_AUT_X', item_id: 'auto-pan-1001', date: '2026-11-15', time_slot: '10:00', available_units: 0, timestamp: 1, slot_id: 'slot-20261115-1000' };
      const ack = await new HttpStockTransport('https://booking.test/api/v3/inventory/stock', 'clave').push(message, 'cid-aut-prueba');
      expect(ack.success).toBe(true);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://booking.test/api/v3/inventory/stock');
      expect((init.headers as Record<string, string>)['X-API-Key']).toBe('clave');
      expect((init.headers as Record<string, string>)['X-Correlation-Id']).toBe('cid-aut-prueba');
      expect(JSON.parse(init.body as string)).toEqual({ service_id: 'NODE_AUT_X', item_id: 'auto-pan-1001', available_units: 0, date: '2026-11-15', time_slot: 'DEFAULT' });
    } finally {
      fetchMock.mockRestore();
    }
  });
});

describe('eventos de flota (CloudEvents)', () => {
  const valid = {
    specversion: '1.0', id: 'e1', type: 'ec.rutalibre.flota.estado_cambiado', source: 'ms-reservas', time: '2026-11-11T15:00:00Z',
    correlationid: 'cid-aut-1', data: { vehicles: [{ vehicle_id: 'auto-pan-1001', state: 'RESERVADO', available_units: 0, date: '2026-11-15', time_slot: '10:00' }] },
  };

  it('acepta un evento válido', () => {
    expect(parseFleetEvent(JSON.stringify(valid))).toEqual({ event: valid });
  });

  it('rechaza (→ cola de muertos) lo que no es un evento de flota válido', () => {
    const errorOf = (value: unknown) => (parseFleetEvent(typeof value === 'string' ? value : JSON.stringify(value)) as { error: string }).error;
    expect(errorOf('{no json')).toBe('no es JSON');
    expect(errorOf({ ...valid, specversion: '0.3' })).toMatch(/CloudEvent/);
    expect(errorOf({ ...valid, type: 'ec.rutalibre.otra.cosa' })).toMatch(/tipo desconocido/);
    expect(errorOf({ ...valid, time: 'ayer' })).toMatch(/time/);
    expect(errorOf({ ...valid, data: {} })).toMatch(/lista/);
    expect(errorOf({ ...valid, data: { vehicles: [{ ...valid.data.vehicles[0], available_units: 2 }] } })).toMatch(/vehículo inválido/);
    expect(errorOf({ ...valid, data: { vehicles: [{ ...valid.data.vehicles[0], time_slot: '10h' }] } })).toMatch(/vehículo inválido/);
  });

  it('sin correlationid se genera uno a partir del id del evento', () => {
    const { correlationid: _omit, ...rest } = valid;
    expect((parseFleetEvent(JSON.stringify(rest)) as { event: { correlationid: string } }).event.correlationid).toBe('cid-inv-e1');
  });
});
