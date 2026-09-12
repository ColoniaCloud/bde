import { expect, type Page, test } from '@playwright/test';

/**
 * Que las cabeceras de seguridad estén y que la política de contenido no
 * bloquee nada que la tienda necesite de verdad.
 */

/**
 * Margen para que las etiquetas de terceros pidan lo suyo.
 *
 * Antes se esperaba a `networkidle`, y dejó de servir: el contenedor de GTM
 * carga Microsoft Clarity, que graba la sesión y mantiene tráfico abierto, así
 * que la página nunca se queda quieta y la espera agotaba los 30 segundos.
 *
 * Se espera entonces a que la página esté usable y se le da este margen fijo.
 * Una violación aparece en la consola apenas el navegador bloquea el pedido, y
 * en las corridas donde hubo una apareció dentro del primer segundo.
 */
const MARGEN_DE_ETIQUETAS_MS = 6_000;

/** Anota lo que el navegador informe como bloqueado por la política. */
function violacionesDe(page: Page) {
  const violations: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (/Content Security Policy|Refused to/i.test(text)) violations.push(text);
  });
  return violations;
}

test('la home responde con las cabeceras de seguridad', async ({ page }) => {
  const response = await page.goto('/');
  const headers = response!.headers();

  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['strict-transport-security']).toContain('max-age=');
});

test('la política de contenido no rompe la tienda', async ({ page }) => {
  const violations = violacionesDe(page);

  await page.goto('/');

  // Las imágenes del catálogo vienen del CDN de Natura: si la CSP las bloqueara,
  // la tienda se vería sin fotos.
  await expect(page.locator('.product-card img').first()).toBeVisible();
  await page.waitForTimeout(MARGEN_DE_ETIQUETAS_MS);

  expect(violations, `violaciones de CSP:\n${violations.join('\n')}`).toEqual([]);
});

test('la política tampoco rompe el panel', async ({ page }) => {
  const violations = violacionesDe(page);

  await page.goto('/admin/login');

  await expect(page.locator('input[type="email"]')).toBeVisible();
  await page.waitForTimeout(MARGEN_DE_ETIQUETAS_MS);

  expect(violations, `violaciones de CSP:\n${violations.join('\n')}`).toEqual([]);
});

test('el health check responde', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);

  const body = await response.json();
  expect(body.status).toBe('ok');
  expect(body.products).toBeGreaterThan(0);
});
