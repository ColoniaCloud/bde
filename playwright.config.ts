import { defineConfig, devices } from '@playwright/test';

/**
 * Pruebas de extremo a extremo sobre los recorridos que no pueden romperse.
 *
 * Asumen un servidor ya corriendo en BASE_URL con la base cargada
 * (`npm run catalog:seed`). En CI se levanta antes de correrlas.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.BASE_URL || 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'es-UY',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // PLAYWRIGHT_CHROMIUM_PATH permite usar un Chromium ya instalado en la
        // máquina, en lugar de que Playwright descargue el suyo. Útil en CI y
        // en entornos sin acceso a la descarga.
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
          : undefined,
      },
    },
  ],
});
