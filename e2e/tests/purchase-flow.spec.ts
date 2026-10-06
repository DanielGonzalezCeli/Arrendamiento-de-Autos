import { expect, test, type Page } from '@playwright/test'

/**
 * Flujo crítico de venta (rúbrica C3): buscar → detalle → registrarse → checkout con extra →
 * confirmación con localizador → mis reservas → cancelar. Guarda capturas si SCREENSHOTS=1.
 */

/** Fecha "YYYY-MM-DD" dentro de N días (hora de Ecuador). */
function inDays(days: number): string {
  return new Date(Date.now() - 5 * 3600_000 + days * 86_400_000).toISOString().slice(0, 10)
}

async function snap(page: Page, name: string) {
  if (process.env.SCREENSHOTS) await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true })
}

test('un cliente nuevo busca, reserva con un extra y cancela', async ({ page }) => {
  const email = `e2e+${Date.now()}@rutalibre.test`
  const start = 20 + Math.floor(Math.random() * 150)

  // 1. Portada y búsqueda
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Alquila el auto ideal/ })).toBeVisible()
  // Sin opciones duplicadas: cada mostrador del aeropuerto aparece una sola vez, como agencia
  await expect(page.locator('#pickup option', { hasText: 'Aeropuerto Mariscal Sucre (UIO) · Andes' })).toHaveCount(1)
  await expect(page.locator('#pickup option[value^="airport:"]')).toHaveCount(0)
  await snap(page, '01-home')

  await page.locator('#pickup').selectOption({ label: 'Aeropuerto Mariscal Sucre (UIO) · Andes' })
  await page.locator('#from-date').fill(inDays(start))
  await page.locator('#to-date').fill(inDays(start + 3))
  await page.getByRole('button', { name: 'Buscar vehículos' }).first().click()

  // 2. Resultados
  await expect(page).toHaveURL(/\/buscar\?/)
  await expect(page.getByRole('heading', { name: /vehículos? disponibles?/ })).toBeVisible()
  const firstOffer = page.getByRole('link', { name: 'Ver y reservar' }).first()
  await expect(firstOffer).toBeVisible()
  await snap(page, '02-resultados')

  // 3. Detalle
  await firstOffer.click()
  await expect(page.getByRole('heading', { level: 1, name: /o similar/ })).toBeVisible()
  await expect(page.getByText('Tu alquiler')).toBeVisible()
  await snap(page, '03-detalle')

  // 4. Reservar sin sesión → login → registro → vuelve al checkout
  await page.getByRole('link', { name: 'Reservar este vehículo' }).click()
  await expect(page).toHaveURL(/\/ingresar\?volver=/)
  await page.getByRole('link', { name: 'Regístrate' }).click()
  await page.locator('#firstName').fill('Elena')
  await page.locator('#lastName').fill('Prueba')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill('Prueba2026')
  await snap(page, '04-registro')
  await page.getByRole('button', { name: 'Crear cuenta' }).click()

  // 5. Checkout: hold con cuenta regresiva, extra y confirmación
  await expect(page).toHaveURL(/\/reservar\//)
  await expect(page.getByText(/Vehículo reservado para ti durante/)).toBeVisible()
  const total = page.locator('text=Total').last().locator('..')
  const totalBefore = await total.textContent()
  await page.getByText('Navegador GPS').click()
  await expect(total).not.toHaveText(totalBefore ?? '')
  await expect(page.locator('#firstName')).toHaveValue('Elena')
  await snap(page, '05-checkout')
  await page.getByRole('button', { name: 'Continuar al pago' }).click()

  // 6. Pasarela simulada: tarjeta inválida → rechazada por el banco → aprobada
  const pay = page.getByRole('dialog')
  await expect(pay.getByText('RutaPay · Pago seguro')).toBeVisible()
  await pay.locator('#card-number').fill('4242 4242 4242 4241')
  await pay.locator('#card-expiry').fill('12/30')
  await pay.locator('#card-cvv').fill('123')
  await pay.getByRole('button', { name: /^Pagar/ }).click()
  await expect(pay.getByText('El número de tarjeta no es válido. Revisa que esté bien escrito.')).toBeVisible()

  await pay.locator('#card-number').fill('4000 0000 0000 0002')
  await pay.getByRole('button', { name: /^Pagar/ }).click()
  await expect(pay.getByText(/Pago rechazado\. El banco emisor rechazó la tarjeta/)).toBeVisible({ timeout: 20_000 })
  await snap(page, '05b-pago-rechazado')

  await pay.locator('#card-number').fill('4242 4242 4242 4242')
  await pay.locator('#card-cvv').fill('123')
  await snap(page, '05c-pasarela')
  await pay.getByRole('button', { name: /^Pagar/ }).click()
  await expect(pay.getByText('Pago aprobado')).toBeVisible({ timeout: 20_000 })

  // 7. Confirmación
  await expect(page.getByText('¡Reserva confirmada!')).toBeVisible()
  // Dónde retirar y devolver: agencia, dirección, teléfono y mapa
  await expect(page.getByText('Aeropuerto Mariscal Sucre (UIO) · Andes').first()).toBeVisible()
  await expect(page.getByRole('link', { name: /Ver en Google Maps/ })).toHaveCount(2)
  await expect(page.getByRole('link', { name: '+59322000001' }).first()).toBeVisible()
  await expect(page.getByText('Visa •••• 4242')).toBeVisible()
  const locator = await page.locator('strong.font-mono').first().textContent()
  expect(locator).toMatch(/^[A-Z]+-[A-Z2-9]{6}$/)
  await expect(page.getByText('Navegador GPS').first()).toBeVisible()
  await snap(page, '06-confirmacion')

  // 8. Mis reservas → cancelar
  await page.getByRole('link', { name: 'Mis reservas' }).first().click()
  await expect(page).toHaveURL(/\/mis-reservas$/)
  const card = page.getByRole('link', { name: new RegExp(locator!) })
  await expect(card).toBeVisible()
  await snap(page, '07-mis-reservas')
  await card.click()
  await page.getByRole('button', { name: 'Cancelar reserva' }).click()
  await page.getByRole('button', { name: 'Sí, cancelar' }).click()
  await expect(page.getByText(/Cancelada el/)).toBeVisible()
  await snap(page, '08-cancelada')
})

test('rutas privadas redirigen al login', async ({ page }) => {
  await page.goto('/mis-reservas')
  await expect(page).toHaveURL(/\/ingresar\?volver=%2Fmis-reservas/)
  await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible()
})
