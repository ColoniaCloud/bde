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
  const account = page.locator('.account-button');
  // Mientras se consulta la sesión muestra «cuenta»; después, «ingresar».
  await expect(account).toHaveText(/ingresar/);

  // Con Google configurado, «ingresar» es un botón que abre un panel con el
  // botón de Google y un enlace a la cuenta; sin Google, es un enlace directo.
  const opensPanel = await account.evaluate((element) => element.tagName === 'BUTTON');
  await account.click();

  if (opensPanel) {
    const popover = page.getByRole('dialog', { name: 'Ingresar a tu cuenta' });
    await expect(popover.locator('.google-signin')).toBeVisible();
    await popover.getByRole('link', { name: 'Ver mi cuenta' }).click();
  }

  await expect(page).toHaveURL(/\/cuenta/);
});

test('los favoritos de la cuenta piden sesión', async ({ request }) => {
  expect((await request.get('/api/account/favorites')).status()).toBe(401);
  const write = await request.put('/api/account/favorites', { data: { favorites: [1, 2] } });
  expect(write.status()).toBe(401);
});
