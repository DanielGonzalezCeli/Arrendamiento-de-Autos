import { expect, test } from '@playwright/test'

/** La portada y los resultados son usables en un teléfono (sin scroll horizontal). */
test.use({ viewport: { width: 390, height: 844 } })

test('móvil: portada y resultados sin desbordes horizontales', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#pickup option', { hasText: 'Guayaquil — todas las agencias' })).toHaveCount(1)
  if (process.env.SCREENSHOTS) await page.screenshot({ path: 'screenshots/m1-home.png', fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)

  await page.locator('#pickup').selectOption({ label: 'Guayaquil — todas las agencias' })
  await page.getByRole('button', { name: 'Buscar vehículos' }).click()
  await expect(page.getByRole('heading', { name: /vehículos? disponibles?/ })).toBeVisible()
  if (process.env.SCREENSHOTS) await page.screenshot({ path: 'screenshots/m2-resultados.png' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})
