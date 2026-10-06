import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { randomUUID } from 'crypto'

/**
 * Panel de administración (rúbrica C2): un cliente reserva por la API interna y el administrador,
 * desde la interfaz, la encuentra, registra la entrega (asigna placa) y la devolución, y recorre
 * todas las secciones. Contra producción requiere E2E_ADMIN_PASSWORD.
 */

const API = process.env.E2E_API_URL ?? 'http://localhost:3000'
const REMOTE = Boolean(process.env.E2E_BASE_URL)
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? (REMOTE ? undefined : 'Admin12345!')

async function snap(page: Page, name: string) {
  if (process.env.SCREENSHOTS) await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true })
}

function futureDate(days: number) {
  const ymd = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
  return `${ymd}T10:00:00-05:00`
}

/** Reserva de un cliente nuevo por la API interna; devuelve el localizador. */
async function bookAsCustomer(request: APIRequestContext): Promise<string> {
  const reg = await request.post(`${API}/api/auth/register`, {
    data: { email: `e2e+adm${Date.now()}@rutalibre.test`, password: 'Prueba2026', firstName: 'Mario', lastName: 'Operación' },
  })
  expect(reg.ok()).toBeTruthy()
  const headers = { Authorization: `Bearer ${(await reg.json()).accessToken}` }
  const day = 30 + Math.floor(Math.random() * 200)

  const search = await (await request.post(`${API}/api/search`, {
    data: { pickupAirport: 'UIO', pickupAt: futureDate(day), dropoffAt: futureDate(day + 2), driverAge: 33 },
  })).json()
  const vehicleId = search.offers[0].vehicle.id
  const hold = await (await request.post(`${API}/api/checkout/hold`, { headers, data: { searchToken: search.searchToken, vehicleId } })).json()
  const preview = await (await request.post(`${API}/api/checkout/preview`, {
    headers, data: { searchToken: search.searchToken, vehicleId, holdId: hold.holdId, extras: [] },
  })).json()
  const confirmed = await request.post(`${API}/api/checkout/confirm`, {
    headers: { ...headers, 'Idempotency-Key': randomUUID() },
    data: { orderPreviewId: preview.orderPreviewId, driver: { firstName: 'Mario', lastName: 'Operación', email: 'mario@correo.ec' }, paymentToken: 'tok_sim_visa_4242_e2eadmin1' },
  })
  expect(confirmed.status()).toBe(201)
  return (await confirmed.json()).locator
}

test('el administrador entrega y recibe un vehículo y recorre el panel', async ({ page, request }) => {
  test.skip(!ADMIN_PASSWORD, 'Define E2E_ADMIN_PASSWORD para probar el panel en producción')
  const locator = await bookAsCustomer(request)

  // Login como administrador
  await page.goto('/ingresar')
  await page.locator('#email').fill('admin@rutalibre.ec')
  await page.locator('#password').fill(ADMIN_PASSWORD!)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await page.getByRole('link', { name: 'Admin' }).click()

  // Resumen
  await expect(page.getByRole('heading', { name: 'Resumen de operación' })).toBeVisible()
  await expect(page.getByText('Ingresos del mes')).toBeVisible()
  await snap(page, 'admin-01-resumen')

  // Reservas → buscar por localizador → detalle
  const nav = page.getByRole('navigation', { name: 'Panel de administración' })
  await nav.getByRole('link', { name: 'Reservas' }).click()
  await page.getByPlaceholder('Localizador, correo o apellido').fill(locator)
  await expect(page.getByRole('link', { name: locator })).toHaveCount(1)
  await snap(page, 'admin-02-reservas')
  await page.getByRole('link', { name: locator }).click()
  await expect(page.getByRole('heading', { name: locator })).toBeVisible()

  // Entrega: asigna una placa libre
  await page.getByRole('button', { name: 'Registrar entrega' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.locator('#unit option').first()).toHaveText(/[A-Z]{3}-\d{3,4}/)
  await snap(page, 'admin-03-entrega')
  await dialog.getByRole('button', { name: 'Confirmar entrega' }).click()
  await expect(page.getByText(/Entregado: placa [A-Z]{3}-\d{3,4}/)).toBeVisible()
  await expect(page.getByText('En curso')).toBeVisible()

  // Devolución
  await page.getByRole('button', { name: 'Registrar devolución' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar devolución' }).click()
  await expect(page.getByText('Finalizada')).toBeVisible()
  await expect(page.getByText('Vehículo devuelto')).toBeVisible()
  await snap(page, 'admin-04-devuelta')

  // Resto de secciones
  const sections: [string, string][] = [
    ['Modelos', 'Modelos'],
    ['Flota', 'Flota'],
    ['Agencias', 'Agencias'],
    ['Catálogo y tarifas', 'Catálogo y tarifas'],
    ['Usuarios', 'Usuarios'],
    ['Integración', 'Integración con el Booking Hub'],
  ]
  for (const [link, heading] of sections) {
    await nav.getByRole('link', { name: link }).click()
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
    await expect(page.locator('table').first()).toBeVisible()
    await snap(page, `admin-05-${link.split(' ')[0].toLowerCase()}`)
  }

  // Validación en el formulario de flota: placa con formato inválido
  await nav.getByRole('link', { name: 'Flota' }).click()
  await page.getByRole('button', { name: 'Nueva unidad' }).click()
  await page.getByRole('dialog').getByLabel('Placa *').fill('1234')
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByRole('dialog').getByText('Formato ABC-1234')).toBeVisible()
  await snap(page, 'admin-06-validacion')
})

test('un cliente no puede entrar al panel', async ({ page }) => {
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/ingresar/)
})
