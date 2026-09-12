import { expect, test } from '@playwright/test';

/**
 * La tienda desde el lado del cliente.
 *
 * Cada prueba cubre algo que, si se rompe, cuesta ventas: que se vean los
 * productos, que se pueda buscar, que el carrito guarde y que el checkout
 * valide.
 */

test('la home muestra el catálogo', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('.product-card').first()).toBeVisible();
  await expect(page.locator('.product-card')).toHaveCount(24);
  await expect(page.getByText(/productos/).first()).toBeVisible();
});

test('la búsqueda filtra y queda en la URL', async ({ page }) => {
  await page.goto('/?q=Ekos#productos');

  await expect(page.getByRole('heading', { name: /Resultados para/ })).toBeVisible();
  const cards = page.locator('.product-card');
  await expect(cards.first()).toBeVisible();
  // Una búsqueda filtrada tiene que poder compartirse por URL.
  expect(page.url()).toContain('q=Ekos');
});

test('se puede navegar a una categoría', async ({ page }) => {
  await page.goto('/');
  await page.locator('.category-card').first().click();

  await expect(page).toHaveURL(/\/categoria\//);
  await expect(page.locator('.product-card').first()).toBeVisible();
});

test('la ficha de producto abre desde la tarjeta', async ({ page }) => {
  await page.goto('/');
  const firstProduct = page.locator('.product-card h3 a').first();
  const name = await firstProduct.textContent();
  await firstProduct.click();

  await expect(page).toHaveURL(/\/productos\/\d+/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(name!.trim());
});

test('agregar a la bolsa la actualiza y sobrevive a una recarga', async ({ page }) => {
  await page.goto('/');
  await page.locator('.product-card .add-button').first().click();

  const bag = page.locator('.bag-button b');
  await expect(bag).toHaveText('1');

  // El carrito vive en localStorage: tiene que seguir ahí al volver.
  await page.reload();
  await expect(bag).toHaveText('1');
});

test('el checkout exige nombre y correo antes de dejar seguir', async ({ page }) => {
  await page.goto('/');
  await page.locator('.product-card .add-button').first().click();
  await page.locator('.bag-button').click();

  await expect(page.getByRole('dialog')).toBeVisible();
  await page.locator('.whatsapp-checkout').click();

  await expect(page.locator('.checkout-error')).toContainText(/nombre/i);
});

test('un producto inexistente devuelve 404', async ({ page }) => {
  const response = await page.goto('/productos/999999999');
  expect(response?.status()).toBe(404);
});

/**
 * El mapa del sitio tiene que salir de la base, no del build.
 *
 * El CI compila **antes** de cargar el catálogo, así que si esta página volviera
 * a armarse durante el build llegaría acá con las cuatro URLs fijas y sin un
 * solo producto: exactamente lo que vería Google tras un despliegue.
 */
test('el mapa del sitio lista el catálogo entero', async ({ page }) => {
  const response = await page.goto('/sitemap.xml');
  expect(response?.status()).toBe(200);

  const xml = await response!.text();
  expect(xml).toContain('/categoria/perfumeria');
  expect((xml.match(/\/productos\//g) ?? []).length).toBeGreaterThan(100);
});
