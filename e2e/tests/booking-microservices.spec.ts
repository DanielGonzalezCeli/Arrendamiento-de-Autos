import { expect, test } from '@playwright/test'
import { randomUUID } from 'crypto'

/**
 * Prueba entre microservicios con el flujo de Booking, todo por el API Gateway (sin navegador):
 * POST /api/v3/clientes → ms-clientes; POST /api/v3/autos/orders → ms-reservas, que pide el cliente a
 * ms-clientes reenviando la X-API-Key y el X-Correlation-Id. Necesita E2E_BOOKING_API_KEY (la misma clave
 * configurada en ms-reservas y ms-clientes); sin ella se omite.
 */
const API = process.env.E2E_API_URL ?? 'http://localhost:3000'
const KEY = process.env.E2E_BOOKING_API_KEY

test('Booking: alta de cliente en ms-clientes y reserva vinculada en ms-reservas, con el mismo correlation id', async ({ request }) => {
  test.skip(!KEY, 'E2E_BOOKING_API_KEY no definida')
  const booking = { 'X-API-Key': KEY!, 'X-Correlation-Id': `cid-e2e-${randomUUID().slice(0, 8)}` }
  const id = `09${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`
  const email = `e2e.${id}@example.com`

  const created = await request.post(`${API}/api/v3/clientes`, {
    headers: booking, data: { nombre: 'Prueba Microservicios', email, identificacion: id, licencia: id },
  })
  expect(created.status()).toBe(201)
  expect(created.headers()['x-upstream-service']).toBe('ms-clientes')
  expect(created.headers()['x-correlation-id']).toBe(booking['X-Correlation-Id'])
  const clientId = (await created.json()).client_id

  const catalog = await (await request.get(`${API}/api/v3/autos?limit=100`)).json()
  const car = catalog.data[Math.floor(Math.random() * catalog.data.length)]
  const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)
  const start = 120 + Math.floor(Math.random() * 200)
  const order = await request.post(`${API}/api/v3/autos/orders`, {
    headers: { ...booking, 'Idempotency-Key': randomUUID() },
    data: {
      vehicle_id: car.vehicle_id, pickup_date: day(start), dropoff_date: day(start + 2), coverage_type: 'BASIC',
      driver: { full_name: 'Prueba Microservicios', email, phone: '+593987001122', license_number: id, age: 35 },
    },
  })
  expect(order.status()).toBe(201)
  expect(order.headers()['x-upstream-service']).toBe('ms-reservas')
  const body = await order.json()
  // Sin client_id en el pedido: ms-reservas lo resolvió en ms-clientes por la licencia, sin duplicar al cliente
  expect(body.client_id).toBe(clientId)

  const again = await request.get(`${API}/api/v3/clientes?identificacion=${id}`, { headers: booking })
  expect((await again.json()).client_id).toBe(clientId)

  const cancel = await request.post(`${API}/api/v3/orders/${body.pnr}/cancel`, { headers: { ...booking, 'Idempotency-Key': randomUUID() }, data: {} })
  expect(cancel.ok()).toBeTruthy()
})

/**
 * Fase D, de punta a punta con RabbitMQ: la reserva de Booking cambia el estado del auto en ms-reservas, que publica
 * flota.estado_cambiado; ms-inventario lo consume y envía el stock (0 unidades) a Booking (simulado en CI). El panel
 * /admin/booking lo muestra. Necesita un broker real: se activa con E2E_STOCK_EVENTS=1 (CI).
 */
test('Booking: la reserva viaja por RabbitMQ hasta ms-inventario y el stock llega a Booking', async ({ request }) => {
  test.skip(!KEY || !process.env.E2E_STOCK_EVENTS, 'requiere E2E_BOOKING_API_KEY y E2E_STOCK_EVENTS=1 (RabbitMQ)')
  test.setTimeout(60_000)
  const login = await request.post(`${API}/api/auth/login`, { data: { email: 'admin@rutalibre.ec', password: process.env.E2E_ADMIN_PASSWORD ?? 'Admin12345!' } })
  expect(login.ok()).toBeTruthy()
  const admin = { Authorization: `Bearer ${(await login.json()).accessToken}` }

  const catalog = await (await request.get(`${API}/api/v3/autos?limit=100`)).json()
  const car = catalog.data[Math.floor(Math.random() * catalog.data.length)]
  const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)
  const start = 120 + Math.floor(Math.random() * 200)
  const id = `08${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`
  const cid = `cid-e2e-stock-${randomUUID().slice(0, 8)}`
  const order = await request.post(`${API}/api/v3/autos/orders`, {
    headers: { 'X-API-Key': KEY!, 'X-Correlation-Id': cid, 'Idempotency-Key': randomUUID() },
    data: {
      vehicle_id: car.vehicle_id, pickup_date: day(start), dropoff_date: day(start + 2), pickup_time: '11:30', coverage_type: 'BASIC',
      driver: { full_name: 'Prueba Eventos', email: `eventos.${id}@example.com`, phone: '+593987001122', license_number: id, age: 35 },
    },
  })
  expect(order.status()).toBe(201)

  // ms-inventario envió a Booking 0 unidades para ese auto con la fecha y hora de retiro
  await expect.poll(async () => {
    const overview = await (await request.get(`${API}/api/admin/booking`, { headers: admin })).json()
    return overview.pushes.find((p: { itemId: string; availableUnits: string; date: string }) =>
      p.itemId === car.vehicle_id && p.availableUnits === '0' && p.date === day(start))
  }, { timeout: 30_000, intervals: [1_000] }).toMatchObject({ success: true, timeSlot: '11:30', transport: 'http' })

  const overview = await (await request.get(`${API}/api/admin/booking`, { headers: admin })).json()
  expect(overview.config.eventBus).toMatchObject({ mode: 'rabbitmq', connected: true, consumerConnected: true })

  const pnr = (await order.json()).pnr
  await request.post(`${API}/api/v3/orders/${pnr}/cancel`, { headers: { 'X-API-Key': KEY!, 'Idempotency-Key': randomUUID() }, data: {} })
})
