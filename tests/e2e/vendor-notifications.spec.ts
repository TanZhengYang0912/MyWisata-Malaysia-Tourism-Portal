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
  const probe = await page.request.post('/api/auth/demo-signin', { data: { email } });
  if (probe.status() === 401) {
    test.skip(true, `Seeded vendor session unavailable for ${email}`);
  }
  expect(probe.status(), `Demo sign-in probe failed for ${email}`).toBe(200);
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(DEMO_PASSWORD);
  await page.locator('form').getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL(/\/vendor\//, { timeout: 15_000 });
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

async function mockVendorNotifications(page: Page, options?: { total?: number; manager?: boolean }) {
  const requests: URL[] = [];
  const readIds: string[] = [];
  let readAllCalls = 0;
  const total = options?.total ?? 20;
  const rows = Array.from({ length: total }, (_, index) => fixture(index + 1));
  // Include sensitive categories in the raw fixture so the manager contract
  // is exercised explicitly: the server-side scope must remove these before
  // they reach the manager's notification center.
  const rawRows = options?.manager
    ? [...rows, { ...fixture(900, 'vendor_wallet'), title: 'Vendor wallet balance changed' }, { ...fixture(901, 'vendor_account'), title: 'Vendor account review' }]
    : rows;

  await page.route('**/api/notifications?*', async (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    const pageNumber = Number(url.searchParams.get('page') ?? '1');
    const pageSize = Number(url.searchParams.get('pageSize') ?? '15');
    const category = url.searchParams.get('category');
    const read = url.searchParams.get('read');
    let filtered = rawRows;
    if (options?.manager) filtered = filtered.filter((row) => !['vendor_wallet', 'vendor_account'].includes(row.category));
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
  test('owner manages the notification history from the bell', async ({ page }) => {
    const mock = await mockVendorNotifications(page);
    await signInAsVendor(page, OWNER_EMAIL);
    await page.goto('/vendor/dashboard');

    await expect(page.getByRole('button', { name: 'Notifications' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Notifications', exact: true })).toHaveCount(0);
    const bell = page.getByRole('button', { name: 'Notifications' });
    await bell.click();
    await expect(page.getByRole('button', { name: 'Mark all as read', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'View all notifications' })).toHaveCount(0);
    await expect(page.getByText('Vendor notification 1', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Vendor notification \d+/ })).toHaveCount(15);

    await page.getByRole('button', { name: 'Orders', exact: true }).click();
    await expect.poll(() => mock.requests.some((url) => url.searchParams.get('category') === 'vendor_orders')).toBe(true);
    await page.getByRole('button', { name: 'Wallet', exact: true }).click();
    await expect.poll(() => mock.requests.some((url) => url.searchParams.get('category') === 'vendor_wallet')).toBe(true);
    await page.getByRole('button', { name: 'Orders', exact: true }).click();

    await page.getByRole('button', { name: /^Vendor notification 1\b/ }).click();
    await expect.poll(() => mock.readIds).toContain('vendor-notification-1');

    await page.getByRole('button', { name: 'Mark all as read', exact: true }).click();
    await expect.poll(() => mock.readAllCalls).toBe(1);

    await page.getByRole('button', { name: 'Load more', exact: true }).click();
    await expect(page.getByText('Vendor notification 16')).toBeVisible();
    await expect(page.getByRole('button', { name: /Vendor notification \d+/ })).toHaveCount(20);
    await expect.poll(() => mock.requests.some((url) => url.searchParams.get('page') === '2')).toBe(true);
  });

  test('outlet manager receives only assigned-outlet notices in the bell', async ({ page }) => {
    const mock = await mockVendorNotifications(page, { total: 1, manager: true });
    await signInAsVendor(page, MANAGER_EMAIL);
    await page.goto('/vendor/dashboard');

    await expect(page.getByRole('button', { name: 'Notifications' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Notifications', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Notifications' }).click();
    await expect(page.getByText('Vendor notification 1')).toBeVisible();
    await expect(page.getByText('Vendor wallet balance changed')).toBeHidden();
    await expect(page.getByText('Vendor account review')).toBeHidden();
    await expect.poll(() => mock.requests.some((url) => url.searchParams.get('scope') === 'vendor' && url.searchParams.get('vendorId') === VENDOR_ONE)).toBe(true);

    // Verify the real server response, independently of the deterministic UI
    // fixture above. Outlet-manager scope must filter wallet/account rows at
    // the API boundary rather than relying on the browser to hide them.
    const scopedResponse = await page.request.get(`/api/notifications?scope=vendor&vendorId=${VENDOR_ONE}&page=1&pageSize=15`);
    expect(scopedResponse.status()).toBe(200);
    const scopedPayload = await scopedResponse.json() as { data?: { items?: Array<{ category?: string }> } };
    const scopedItems = scopedPayload.data?.items ?? [];
    expect(scopedItems.some((item) => ['vendor_wallet', 'vendor_account'].includes(item.category ?? ''))).toBe(false);

    // This request is intentionally not mocked: the server must reject a
    // valid, approved vendor outside the manager's assigned outlet scope.
    const crossVendor = await page.request.get(`/api/notifications?scope=vendor&vendorId=${VENDOR_TWO}&page=1&pageSize=15`);
    expect(crossVendor.status()).toBe(403);
    const payload = await crossVendor.json() as { error?: { code?: string } };
    expect(payload.error?.code).toBe('FORBIDDEN');
  });

  test('high-priority email outbox seam remains protected from browser callers', async ({ page }) => {
    await signInAsVendor(page, OWNER_EMAIL);
    const response = await page.request.post('/api/internal/email-outbox/process', {
      data: { limit: 1 },
    });
    // Email processing is a server-side worker seam. A browser session must
    // never be able to trigger it without the configured worker secret.
    expect(response.status()).toBe(401);
  });
});
