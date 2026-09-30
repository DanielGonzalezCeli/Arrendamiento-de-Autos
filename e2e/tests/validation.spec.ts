import { expect, test } from '@playwright/test'

/** Validación de formularios en el navegador (las mismas reglas las aplica el backend). */
test('registro: nombres sin números, correo con dominio y teléfono según el país', async ({ page }) => {
  await page.goto('/registro')

  // Los números y símbolos no se pueden escribir en el nombre
  await page.locator('#firstName').pressSequentially('Ana3 Ma4ría!')
  await expect(page.locator('#firstName')).toHaveValue('Ana María')

  // Correo sin dominio → error al salir del campo
  await page.locator('#email').fill('ana@correo')
  await page.locator('#email').blur()
  await expect(page.getByText('Correo inválido: usa el formato nombre@dominio.com.')).toBeVisible()
  await page.locator('#email').fill('ana@correo.com')

  // Teléfono de un turista de EE. UU.: dígitos de menos → error; 10 dígitos → válido
  await page.getByLabel('País del teléfono').selectOption('US')
  await page.locator('#phone').fill('20255')
  await page.locator('#phone').blur()
  await expect(page.getByText(/revisa la cantidad de dígitos/)).toBeVisible()
  await page.locator('#phone').fill('2025550143')
  await expect(page.getByText(/revisa la cantidad de dígitos/)).toHaveCount(0)

  // Enviar con errores pendientes no navega y muestra todos los errores
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page.getByText('Ingresa tu apellido.')).toBeVisible()
  await expect(page.getByText('Mínimo 8 caracteres.')).toBeVisible()
  await expect(page).toHaveURL(/\/registro/)
  if (process.env.SCREENSHOTS) await page.screenshot({ path: 'screenshots/09-registro-validacion.png', fullPage: true })
})

test('las ofertas muestran fotos reales de los modelos y hay página de créditos', async ({ page }) => {
  await page.goto('/buscar?pickup=airport:UIO&from=2026-11-10&fromTime=10:00&to=2026-11-13&toTime=10:00&age=30&currency=USD')
  const photo = page.locator('img[src^="/cars/"]').first()
  await expect(photo).toBeVisible()
  expect(await photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
  if (process.env.SCREENSHOTS) await page.screenshot({ path: 'screenshots/10-resultados-fotos.png', fullPage: true })

  await page.getByRole('link', { name: 'Créditos de imágenes' }).click()
  await expect(page.getByRole('heading', { name: 'Créditos de imágenes' })).toBeVisible()
  await expect(page.getByText(/Licencia:/)).toHaveCount(10)
})
