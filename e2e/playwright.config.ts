import { defineConfig, devices } from '@playwright/test'

/**
 * E2E del marketplace. Por defecto contra el entorno local (vite en :5173 + API en :3000).
 * Para probar producción: E2E_BASE_URL=https://arrendamiento-autos-web.onrender.com npx playwright test
 */
export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    locale: 'es-EC',
    timezoneId: 'America/Guayaquil',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1360, height: 900 } } },
  ],
})
