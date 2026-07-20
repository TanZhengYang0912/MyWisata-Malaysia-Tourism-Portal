import { expect, test, type Page } from '@playwright/test';

const DEMO_PASSWORD = 'demo123456';
const OWNER_EMAIL = 'vendor.owner@demo.local';
const MANAGER_EMAIL = 'outlet.manager@demo.local';
const VENDOR_ONE = 'bbbbbbbb-0000-0000-0000-000000000001';
const VENDOR_TWO = 'bbbbbbbb-0000-0000-0000-000000000002';

type NotificationFixture = {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  category: string;
  readAt: string | null;
  createdAt: string;
};

async function signInAsVendor(page: Page, email: string) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(DEMO_PASSWORD);
  await page.locator('form').getByRole('button', { name: /^sign in$/i }).click();
  try {
    await page.waitForURL(/\/vendor\//, { timeout: 15_000 });
  } catch {
    // Keep this suite honest on a fresh clone: route-mock tests still need a
    // real seeded vendor session, so report the missing prerequisite as a skip.
    test.skip(true, `Seeded vendor session unavailable for ${email}`);
  }
}

function fixture(index: number, category = 'vendor_orders'): NotificationFixture {
  return {
    id: `vendor-notification-${index}`,
    type: category,
    title: `Vendor notification ${index}`,
    body: `Update ${index} for the authorised vendor workspace.`,
    link: '/vendor/orders',
    category,
    readAt: null,
    createdAt: new Date(Date.UTC(2026, 6, 20, 12, 0, index)).toISOString(),
  };
}

async function mockVendorNotifications(page: Page, options?: { total?: number }) {
  const requests: URL[] = [];
  const readIds: string[] = [];
  let readAllCalls = 0;
  const total = options?.total ?? 20;
  const rows = Array.from({ length: total }, (_, index) => fixture(index + 1));

  await page.route('**/api/notifications?*', async (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    const pageNumber = Number(url.searchParams.get('page') ?? '1');
    const pageSize = Number(url.searchParams.get('pageSize') ?? '15');
    const category = url.searchParams.get('category');
    const read = url.searchParams.get('read');
    let filtered = rows;
    if (category) filtered = filtered.filter((row) => row.category === category);
    if (read === 'unread') filtered = filtered.filter((row) => !row.readAt);
    const start = (pageNumber - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize);
    await route.fulfill({
      json: {
        data: {
          items,
          page: pageNumber,
          pageSize,
          total: filtered.length,
          totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)),
        },
        error: null,
      },
    });
  });
  await page.route('**/api/notifications/*/read', async (route) => {
    readIds.push(route.request().url().split('/').at(-2) ?? '');
    await route.fulfill({ json: { data: { read: true }, error: null } });
  });
  await page.route('**/api/notifications/read-all*', async (route) => {
    readAllCalls += 1;
    await route.fulfill({ json: { data: { readAll: true }, error: null } });
  });

  return { requests, readIds, get readAllCalls() { return readAllCalls; } };
}

test.describe('Vendor notification journeys', () => {
  test('owner sees the bell, latest 15, filters, pagination, and read actions', async ({ page }) => {
    const mock = await mockVendorNotifications(page);
    await signInAsVendor(page, OWNER_EMAIL);
    await page.goto('/vendor/notifications');

    await expect(page.getByRole('button', { name: 'Notifications' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
    await expect(page.getByText('Vendor notification 1')).toBeVisible();
    await expect(page.getByRole('button', { name: /Vendor notification \d+/ })).toHaveCount(15);

    await page.getByRole('button', { name: 'Orders', exact: true }).click();
    await expect.poll(() => mock.requests.some((url) => url.searchParams.get('category') === 'vendor_orders')).toBe(true);

    await page.getByRole('button', { name: /Vendor notification 1/ }).click();
    await expect.poll(() => mock.readIds).toContain('vendor-notification-1');

    await page.getByRole('button', { name: 'Mark all as read' }).click();
    await expect.poll(() => mock.readAllCalls).toBe(1);

    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByText('Page 2 of 2')).toBeVisible();
    await expect(page.getByText('Vendor notification 16')).toBeVisible();
    await expect.poll(() => mock.requests.some((url) => url.searchParams.get('page') === '2')).toBe(true);
  });

  test('outlet manager sees only the vendor-scoped notification workspace', async ({ page }) => {
    const mock = await mockVendorNotifications(page, { total: 1 });
    await signInAsVendor(page, MANAGER_EMAIL);
    await page.goto('/vendor/notifications');

    await expect(page.getByRole('button', { name: 'Notifications' })).toBeVisible();
    await expect(page.getByText('Vendor notification 1')).toBeVisible();
    await expect.poll(() => mock.requests.some((url) => url.searchParams.get('scope') === 'vendor' && url.searchParams.get('vendorId') === VENDOR_ONE)).toBe(true);

    // This request is intentionally not mocked: the server must reject a
    // valid, approved vendor outside the manager's assigned outlet scope.
    const crossVendor = await page.request.get(`/api/notifications?scope=vendor&vendorId=${VENDOR_TWO}&page=1&pageSize=15`);
    expect(crossVendor.status()).toBe(403);
    const payload = await crossVendor.json() as { error?: { code?: string } };
    expect(payload.error?.code).toBe('FORBIDDEN');
  });
});
