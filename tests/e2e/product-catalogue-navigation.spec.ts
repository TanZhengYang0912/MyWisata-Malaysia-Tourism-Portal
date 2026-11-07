import { expect, test } from '@playwright/test';

test('legacy catalogue links retain query and fragment while redirecting once', async ({ page, request }) => {
  const query = 'source=home&outletId=example&returnTo=%2Fcustomer%2Fexplore%3Fq%3Dtea%23map&campaign=demo';
  const response = await request.get(`/customer/activity/example?${query}`, { maxRedirects: 0 });
  expect(response.status()).toBe(308);
  const location = new URL(response.headers().location, 'http://localhost:3000');
  expect(location.pathname).toBe('/customer/products/example');
  expect(location.searchParams.get('returnTo')).toBe('/customer/explore?q=tea#map');
  expect(location.searchParams.get('campaign')).toBe('demo');
  await page.goto(`/customer/activity/example?${query}#details`);
  expect(new URL(page.url()).pathname).toBe('/customer/products/example');
  expect(new URL(page.url()).hash).toBe('#details');
});

test('catalogue navigation is usable on a narrow viewport', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/customer');
  await expect(page.locator('body')).toBeVisible();
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const product = page.locator('a[href^="/customer/products/"]').first();
  test.skip(await product.count() === 0, 'No public ordinary product is available in this local catalogue.');
  await product.click();
  await expect(page).toHaveURL(/\/customer\/products\//);
  await page.goBack();
  await expect(page).toHaveURL(/\/customer(?:\?.*)?$/);
});
