import { describe, expect, it } from 'vitest'
import { criteriaFromParams, criteriaToApiBody, criteriaToParams, validateCriteria, type SearchCriteria } from './search-criteria'

const criteria: SearchCriteria = {
  pickup: 'airport:UIO', dropoff: '', fromDate: '2026-10-10', fromTime: '10:00', toDate: '2026-10-13', toTime: '09:30', age: 30, currency: 'USD',
}

describe('search-criteria', () => {
  it('ida y vuelta por la URL sin perder datos', () => {
    expect(criteriaFromParams(criteriaToParams(criteria))).toEqual(criteria)
  })

  it('convierte ubicación y fechas al body de la API (RFC 3339, UTC−5)', () => {
    expect(criteriaToApiBody(criteria)).toEqual({
      pickupAirport: 'UIO',
      pickupAt: '2026-10-10T10:00:00-05:00',
      dropoffAt: '2026-10-13T09:30:00-05:00',
      driverAge: 30,
      currency: 'USD',
    })
    expect(criteriaToApiBody({ ...criteria, pickup: 'city:2', dropoff: 'depot:5' })).toMatchObject({ pickupCityId: 2, dropoffDepotId: 5 })
  })

  it('valida lo básico antes de llamar al backend', () => {
    expect(validateCriteria(criteria)).toBeNull()
    expect(validateCriteria({ ...criteria, pickup: '' })).toMatch(/recoger/)
    expect(validateCriteria({ ...criteria, toDate: '2026-10-09' })).toMatch(/posterior/)
    expect(validateCriteria({ ...criteria, toDate: '2026-12-10' })).toMatch(/30 días/)
    expect(validateCriteria({ ...criteria, age: 17 })).toMatch(/edad/)
  })

  it('sin ubicación en la URL no hay búsqueda', () => {
    expect(criteriaFromParams(new URLSearchParams('from=2026-10-10'))).toBeNull()
  })
})
