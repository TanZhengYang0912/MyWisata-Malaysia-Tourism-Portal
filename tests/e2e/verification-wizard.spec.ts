import { expect, test } from '@playwright/test';

test('customer verification wizard exposes five stable steps and progress', async ({ page }) => {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill('customer@demo.local');
  await page.locator('input[type="password"]').fill('demo123456');
  await page.locator('form').getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });

  await page.goto('/customer/profile');
  await expect(page.getByText(/Step \d+ of 5/)).toBeVisible();
  await expect(page.getByText(/Current:/)).toBeVisible();
  await expect(page.getByText(/Next:|Current: Complete/)).toBeVisible();
  await expect(page.getByText(/% complete/)).toBeVisible();
});
