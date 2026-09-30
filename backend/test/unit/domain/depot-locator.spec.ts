import { decodeCursor, paginate } from '../../../src/common/pagination';
import { distanceKm, resolveDepots } from '../../../src/domain/depot-locator';
import { DomainError } from '../../../src/domain/domain-error';

const depots = [
  { id: 1, cityId: 1, airportCode: 'UIO', latitude: -0.129167, longitude: -78.3575 },
  { id: 2, cityId: 1, airportCode: null, latitude: -0.1767, longitude: -78.48 },
  { id: 3, cityId: 2, airportCode: 'GYE', latitude: -2.157419, longitude: -79.883558 },
];

describe('resolveDepots (LocationPoint)', () => {
  it('por código IATA, sin importar mayúsculas', () => {
    expect(resolveDepots(depots, { airport: 'uio' }, 'loc').map((d) => d.id)).toEqual([1]);
  });

  it('por city_id', () => {
    expect(resolveDepots(depots, { cityId: 1 }, 'loc').map((d) => d.id)).toEqual([1, 2]);
  });

  it('por coordenadas: dentro del radio y ordenadas por distancia', () => {
    const centroQuito = { latitude: -0.18, longitude: -78.47 };
    expect(resolveDepots(depots, { coordinates: centroQuito }, 'loc').map((d) => d.id)).toEqual([2, 1]);
  });

  it('airport tiene precedencia sobre city_id', () => {
    expect(resolveDepots(depots, { airport: 'GYE', cityId: 1 }, 'loc').map((d) => d.id)).toEqual([3]);
  });

  it('ubicación sin criterios → 400 con el nombre del campo', () => {
    expect(() => resolveDepots(depots, {}, 'route.pickup.location')).toThrow(DomainError);
  });

  it('distanceKm: Quito–Guayaquil ≈ 270 km', () => {
    expect(distanceKm(-0.18, -78.47, -2.19, -79.89)).toBeGreaterThan(260);
    expect(distanceKm(-0.18, -78.47, -2.19, -79.89)).toBeLessThan(280);
  });
});

describe('paginate (cursor opaco)', () => {
  const items = [1, 2, 3, 4, 5];

  it('primera página y cursor para la siguiente', () => {
    const page = paginate(items, 2, undefined);
    expect(page).toMatchObject({ items: [1, 2], total: 5 });
    expect(paginate(items, 2, page.nextPage!).items).toEqual([3, 4]);
  });

  it('última página sin next_page', () => {
    expect(paginate(items, 10, undefined).nextPage).toBeNull();
  });

  it('cursor manipulado → 400', () => {
    expect(() => decodeCursor('no-es-un-cursor')).toThrow(DomainError);
  });

  it('cursor de otra búsqueda → 400', () => {
    const page = paginate(items, 2, undefined, 'token-a');
    expect(() => paginate(items, 2, page.nextPage!, 'token-b')).toThrow(DomainError);
  });
});
