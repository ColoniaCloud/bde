import { expect, test } from '@playwright/test';

/**
 * La cuenta del cliente. Antes existía pero no protegía nada: ahora la sesión
 * se verifica en el servidor y los pedidos son privados.
 */

test('sin sesión, la página de cuenta ofrece ingresar', async ({ page }) => {
  await page.goto('/cuenta');

  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Ingresá/);
  await expect(page.getByText(/pedidos/i).first()).toBeVisible();
});

test('la cuenta no se indexa', async ({ page }) => {
  await page.goto('/cuenta');
  const robots = page.locator('meta[name="robots"]');
  await expect(robots).toHaveAttribute('content', /noindex/);
});

test('los pedidos no son públicos', async ({ request }) => {
  const response = await request.get('/api/payload/orders');
  expect(response.status()).toBe(403);
});

test('/api/auth/me no inventa una sesión', async ({ request }) => {
  const response = await request.get('/api/auth/me');
  expect(response.status()).toBe(200);

  const body = await response.json();
  expect(body.customer).toBeNull();
});

test('el encabezado lleva a la cuenta', async ({ page }) => {
  await page.goto('/');
  await page.locator('.account-button').click();
  await expect(page).toHaveURL(/\/cuenta/);
});
