import { expect, test } from '@playwright/test';

/**
 * Que las cabeceras de seguridad estén y que la política de contenido no
 * bloquee nada que la tienda necesite de verdad.
 */

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
  const violations: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (/Content Security Policy|Refused to/i.test(text)) violations.push(text);
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Las imágenes del catálogo vienen del CDN de Natura: si la CSP las bloqueara,
  // la tienda se vería sin fotos.
  await expect(page.locator('.product-card img').first()).toBeVisible();
  expect(violations, `violaciones de CSP:\n${violations.join('\n')}`).toEqual([]);
});

test('la política tampoco rompe el panel', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (/Content Security Policy|Refused to/i.test(text)) violations.push(text);
  });

  await page.goto('/admin/login');
  await page.waitForLoadState('networkidle');

  await expect(page.locator('input[type="email"]')).toBeVisible();
  expect(violations, `violaciones de CSP:\n${violations.join('\n')}`).toEqual([]);
});

test('el health check responde', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);

  const body = await response.json();
  expect(body.status).toBe('ok');
  expect(body.products).toBeGreaterThan(0);
});
