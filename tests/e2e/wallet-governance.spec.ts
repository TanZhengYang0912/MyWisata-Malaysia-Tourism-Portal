import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const ADMIN_EMAIL = 'admin@demo.local';
const CUSTOMER_EMAIL = 'customer@demo.local';
const DEMO_PASSWORD = 'demo123456';

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(DEMO_PASSWORD);
  await page.locator('form').getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
}

const settingsPayload = {
  clearanceDays: 7,
  minAmountSen: 5000,
  dualApprovalThresholdSen: 50000,
  escalationHours: 48,
  holdEscalationHours: 168,
  updatedAt: '2026-07-19T01:00:00.000Z',
  updatedBy: 'admin-id',
};

type PatchRecord = { url: string; body: Record<string, unknown> };

async function mockWalletSettings(page: Page, patches: PatchRecord[]) {
  await page.route('**/api/admin/wallet-settings', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { data: settingsPayload, error: null } });
    const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
    patches.push({ url: route.request().url(), body });
    if ('updatedAt' in body || 'updatedBy' in body) return route.fulfill({ status: 422, json: { error: { message: 'unknown setting field' } } });
    return route.fulfill({ json: { data: { settings: body }, error: null } });
  });
}

async function mockWalletApprovers(page: Page, patches: PatchRecord[]) {
  let approvers = [{ id: 'approver-1', email: 'approver@demo.local', name: 'Wallet Approver', accountStatus: 'active', active: true, grantedAt: null }];
  await page.route('**/api/admin/wallet-approvers', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { data: { items: approvers, eligibleUsers: [{ id: 'user-2', email: 'customer2@demo.local', name: 'Customer Bob' }] }, error: null } });
    const body = JSON.parse(route.request().postData() ?? '{}') as { userId: string; action: 'grant' | 'revoke'; reason: string };
    patches.push({ url: route.request().url(), body });
    approvers = [...approvers, { id: body.userId, email: 'customer2@demo.local', name: 'Customer Bob', accountStatus: 'active', active: true, grantedAt: null }];
    return route.fulfill({ json: { data: { userId: body.userId, approver: true, action: body.action }, error: null } });
  });
}

test.describe('Wallet governance browser flows', () => {
  test('Super Admin can save Wallet Settings with a clear reason', async ({ page }) => {
    const patches: PatchRecord[] = [];
    await mockWalletSettings(page, patches);

    await signIn(page, ADMIN_EMAIL);
    await page.goto('/admin/wallet/settings');
    await expect(page.getByRole('heading', { name: 'Wallet governance settings' })).toBeVisible();

    await page.getByLabel('Reward clearance days').fill('10');
    await page.locator('textarea').nth(0).fill('Adjust clearance for settlement operations');
    await page.getByRole('button', { name: /save settings/i }).click();
    await expect(page.getByText('Wallet governance settings saved.')).toBeVisible();
    expect(patches[0].body).toMatchObject({ clearanceDays: 10, reason: 'Adjust clearance for settlement operations' });
    expect(patches[0].body).not.toHaveProperty('updatedAt');

    await page.locator('textarea').nth(0).fill('short');
    await page.getByRole('button', { name: /save settings/i }).click();
    await expect(page.getByText('A change reason of at least 10 characters is required.')).toBeVisible();
    expect(patches).toHaveLength(1);
  });

  test('Super Admin can grant a Wallet Approver with a clear reason', async ({ page }) => {
    const patches: PatchRecord[] = [];
    await mockWalletSettings(page, []);
    await mockWalletApprovers(page, patches);

    await signIn(page, ADMIN_EMAIL);
    await page.goto('/admin/wallet/settings');
    await expect(page.getByRole('heading', { name: 'Wallet governance settings' })).toBeVisible();

    await page.locator('textarea').nth(1).fill('Add a second reviewer for payout coverage');
    await page.getByRole('combobox').nth(2).selectOption('user-2');
    await page.getByRole('button', { name: 'Grant access' }).click();
    await expect(page.getByText('Wallet Approver granted.')).toBeVisible();
    expect(patches.at(-1)?.body).toMatchObject({ userId: 'user-2', action: 'grant' });
    await expect(page.getByText('Customer Bob', { exact: true })).toBeVisible();
  });

  test('Super Admin can generate a MYT payout report and export all money totals', async ({ page }) => {
    const requestedPeriods: string[] = [];
    await page.route('**/api/admin/reports/payouts*', async (route) => {
      requestedPeriods.push(new URL(route.request().url()).searchParams.get('period') ?? '');
      return route.fulfill({ json: { data: {
        report_id: 'report-1', period_start: '2026-06-01', period_end: '2026-07-01',
        summary: { total_requested: 4, pending_count: 1, total_completed: 2, total_rejected: 0, total_failed: 1, high_risk_count: 1, amount_requested_rm: 300, amount_approved_rm: 250, amount_paid_rm: 200, amount_failed_rm: 50, amount_reserved_rm: 100, amount_withdrawn_rm: 200 },
      }, error: null } });
    });

    await signIn(page, ADMIN_EMAIL);
    await page.goto('/admin/reports/payouts');
    await expect(page.getByRole('heading', { name: 'Monthly payout reports' })).toBeVisible();
    await expect(page.getByText('Failed RM')).toBeVisible();
    await expect(page.getByText('Reserved RM')).toBeVisible();
    await expect(page.getByText('Withdrawn RM')).toBeVisible();

    await page.locator('input[type="month"]').fill('2026-06');
    await page.getByRole('button', { name: /generate report/i }).click();
    await expect.poll(() => requestedPeriods.at(-1)).toBe('2026-06');

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /export csv/i }).click();
    const download = await downloadPromise;
    const csv = await readFile(await download.path() ?? '', 'utf8');
    expect(csv).toContain('amount_failed_rm,50');
    expect(csv).toContain('amount_reserved_rm,100');
    expect(csv).toContain('amount_withdrawn_rm,200');
  });

  test('Customer can view an owned withdrawal receipt without raw Stripe identifiers', async ({ page }) => {
    await page.route('**/api/wallet/withdrawals/withdrawal-123/receipt', (route) => route.fulfill({ json: { data: {
      id: 'withdrawal-123', reference: 'WD-ABC12345', amountRm: 70, status: 'paid',
      createdAt: '2026-07-19T01:00:00.000Z', updatedAt: '2026-07-19T02:00:00.000Z',
      destinationLabel: 'Stripe Connect · •••• 1234', payoutReference: '••••po_1234',
      customerReason: 'Approved after routine review.',
    }, error: null } }));

    await signIn(page, CUSTOMER_EMAIL);
    await page.goto('/customer/wallet/withdrawals/withdrawal-123');
    await expect(page.getByRole('heading', { name: 'Withdrawal receipt' })).toBeVisible();
    await expect(page.getByText('RM 70.00')).toBeVisible();
    await expect(page.getByText('Stripe Connect · •••• 1234')).toBeVisible();
    await expect(page.getByText('Payout reference: ••••po_1234')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('acct_full_secret');
    await expect(page.locator('body')).not.toContainText('po_full_secret');
  });

  test('Wallet Approver can complete Hold → Resume with a fresh approval cycle', async ({ page }) => {
    const actions: Array<{ action: string; body: Record<string, unknown> }> = [];
    let status = 'pending';
    const detail = () => ({
      id: 'withdrawal-hold-1', userId: 'customer-id', customerDisplayName: 'Customer Bob', amountSen: 10000,
      status, requiresDualApproval: false, approvalCount: 0, riskLevel: 'low', riskOverridden: false,
      createdAt: '2026-07-19T01:00:00.000Z',
      customer: { displayName: 'Customer Bob', email: CUSTOMER_EMAIL, kycStatus: 'approved', kycApprovedAt: null },
      wallet: { topupSen: 0, earningsSen: 10000, pendingEarningsSen: 0, reservedSen: 10000, withdrawnSen: 0 },
      destinationLabel: 'Stripe Connect · •••• 1234', customerReason: status === 'hold' ? 'Please confirm your payout bank details.' : null,
      approvals: [],
    });
    await page.route('**/api/admin/withdrawals?*', (route) => route.fulfill({ json: { data: { items: [detail()], total: 1, totalPages: 1 }, error: null } }));
    await page.route('**/api/admin/withdrawals/withdrawal-hold-1', (route) => route.fulfill({ json: { data: detail(), error: null } }));
    await page.route('**/api/admin/withdrawals/withdrawal-hold-1/*', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      const action = route.request().url().split('/').pop() ?? '';
      const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
      actions.push({ action, body });
      status = action === 'hold' ? 'hold' : action === 'resume' ? 'pending' : status;
      return route.fulfill({ json: { data: { status }, error: null } });
    });

    await signIn(page, ADMIN_EMAIL);
    await page.goto('/admin/withdrawals');
    await page.getByRole('button', { name: /Customer Bob/ }).click();
    await page.getByRole('combobox').last().selectOption('insufficient_payout_information');
    await page.locator('textarea').fill('The payout account needs additional verification.');
    await page.getByRole('button', { name: 'Hold', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Resume review' })).toBeVisible();
    expect(actions[0]).toMatchObject({ action: 'hold', body: { reasonCategory: 'insufficient_payout_information' } });

    await page.getByRole('combobox').last().selectOption('additional_information_verified');
    await page.locator('textarea').fill('The requested payout information has been verified.');
    await page.getByRole('button', { name: 'Resume review' }).click();
    await expect(page.getByText('Status', { exact: true })).toBeVisible();
    expect(actions[1]).toMatchObject({ action: 'resume', body: { reasonCategory: 'additional_information_verified' } });
  });

  test('Customer notification bell shows latest Wallet notifications and marks one read', async ({ page }) => {
    const readIds: string[] = [];
    await page.route('**/api/notifications?*', (route) => route.fulfill({ json: { data: {
      items: [{ id: 'notification-1', type: 'withdrawal_hold', title: 'Withdrawal needs additional review', body: 'Please provide more information through Support.', link: '/customer/support', category: 'wallet', readAt: null, createdAt: '2026-07-20T01:00:00.000Z' }], total: 1, totalPages: 1,
    }, error: null } }));
    await page.route('**/api/notifications/notification-1/read', async (route) => {
      readIds.push('notification-1');
      return route.fulfill({ json: { data: { id: 'notification-1', read: true }, error: null } });
    });

    await signIn(page, CUSTOMER_EMAIL);
    await page.goto('/customer/wallet');
    await page.getByRole('button', { name: 'Notifications' }).click();
    await expect(page.getByText('Withdrawal needs additional review')).toBeVisible();
    await page.getByRole('button', { name: /Withdrawal needs additional review/ }).click();
    expect(readIds).toEqual(['notification-1']);
  });
});
