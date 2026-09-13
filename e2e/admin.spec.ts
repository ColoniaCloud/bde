import { expect, test } from '@playwright/test';

/**
 * El panel. Sin él, quien vende no puede tocar precios ni ver pedidos.
 */

test('el panel pide credenciales', async ({ page }) => {
  await page.goto('/admin');

  await expect(page).toHaveURL(/\/admin\/login/);
  await expect(page.locator('input[type="email"]')).toBeVisible();
});

test('rechaza una contraseña incorrecta', async ({ page }) => {
  await page.goto('/admin/login');
  await page.locator('input[type="email"]').fill('admin@boutiquedeleste.com');
  await page.locator('input[type="password"]').fill('clave-equivocada');
  await page.getByRole('button', { name: /iniciar|login/i }).click();

  await expect(page.getByText(/incorrect|inválid|credencial/i).first()).toBeVisible({ timeout: 10_000 });
  await expect(page).toHaveURL(/\/admin\/login/);
});

test('con las credenciales correctas se entra y se ve el catálogo', async ({ page }) => {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  test.skip(!email || !password, 'Faltan E2E_ADMIN_EMAIL y E2E_ADMIN_PASSWORD');

  await page.goto('/admin/login');
  await page.locator('input[type="email"]').fill(email!);
  await page.locator('input[type="password"]').fill(password!);
  await page.getByRole('button', { name: /iniciar|login/i }).click();

  await expect(page).toHaveURL(/\/admin(?!\/login)/, { timeout: 15_000 });
  await page.goto('/admin/collections/products');
  await expect(page.getByText(/Productos|Products/).first()).toBeVisible();
});
