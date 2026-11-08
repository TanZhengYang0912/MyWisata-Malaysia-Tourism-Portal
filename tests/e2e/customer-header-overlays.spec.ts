import { expect, test, type Locator, type Page } from '@playwright/test';

const VIEWPORT_WIDTHS = [320, 360, 390, 420, 460, 1280];

async function recordViewportBounds(
  page: Page,
  name: string,
  trigger: Locator,
  panel: Locator,
  viewportWidth: number,
  failures: string[],
  close?: () => Promise<void>,
) {
  const triggerBox = await trigger.boundingBox();
  expect(triggerBox, `${name} trigger should be measurable`).not.toBeNull();
  if (triggerBox && (triggerBox.x < 0 || triggerBox.x + triggerBox.width > viewportWidth)) {
    failures.push(`${name} trigger @ ${viewportWidth}px: ${triggerBox.x}..${triggerBox.x + triggerBox.width}`);
  }

  if (close) await close();
  else await trigger.click();
  await expect(panel, `${name} panel should open`).toBeVisible();
  const panelBox = await panel.boundingBox();
  expect(panelBox, `${name} panel should be measurable`).not.toBeNull();
  if (panelBox && (panelBox.x < 8 || panelBox.x + panelBox.width > viewportWidth - 8)) {
    failures.push(`${name} panel @ ${viewportWidth}px: ${panelBox.x}..${panelBox.x + panelBox.width}`);
  }
  await trigger.click();
}

test('shared customer header dropdowns stay within the viewport', async ({ page }) => {
  test.setTimeout(90_000);
  page.setDefaultTimeout(10_000);

  await page.goto('/customer/explore', { waitUntil: 'domcontentloaded' });

  const appearanceTrigger = page.getByRole('button', { name: 'Appearance settings' });
  const currencyTrigger = page.getByRole('combobox', { name: 'Display currency' });
  const notificationTrigger = page.getByRole('button', { name: 'Notifications' });
  const partnerTrigger = page.getByRole('button', { name: 'Partner & More' });
  const accountTrigger = page.getByRole('button', { name: /account menu/i });
  await expect(appearanceTrigger).toBeVisible({ timeout: 30_000 });
  await expect(notificationTrigger).toBeVisible({ timeout: 30_000 });

  const failures: string[] = [];
  for (const viewportWidth of VIEWPORT_WIDTHS) {
    await page.setViewportSize({ width: viewportWidth, height: 800 });
    const currencyBox = await currencyTrigger.boundingBox();
    expect(currencyBox, 'Currency trigger should be measurable').not.toBeNull();
    if (currencyBox && (currencyBox.x < 0 || currencyBox.x + currencyBox.width > viewportWidth)) {
      failures.push(`Currency trigger @ ${viewportWidth}px: ${currencyBox.x}..${currencyBox.x + currencyBox.width}`);
    }
    const notificationBox = await notificationTrigger.boundingBox();
    expect(notificationBox, 'Notifications trigger should be measurable').not.toBeNull();
    if (notificationBox && (notificationBox.x < 0 || notificationBox.x + notificationBox.width > viewportWidth)) {
      failures.push(`Notifications trigger @ ${viewportWidth}px: ${notificationBox.x}..${notificationBox.x + notificationBox.width}`);
    }
    await recordViewportBounds(
      page,
      'Appearance',
      appearanceTrigger,
      page.getByRole('menu', { name: 'Appearance settings' }),
      viewportWidth,
      failures,
    );
    await recordViewportBounds(
      page,
      'Partner',
      partnerTrigger,
      page.getByRole('menu', { name: 'Partner & More' }),
      viewportWidth,
      failures,
    );
    await recordViewportBounds(
      page,
      'Account',
      accountTrigger,
      page.getByRole('menu', { name: 'Account menu' }),
      viewportWidth,
      failures,
    );
  }

  expect(failures).toEqual([]);
});
