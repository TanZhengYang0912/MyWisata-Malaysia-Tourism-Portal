import { expect, test, type Page } from '@playwright/test';

const CUSTOMER_EMAIL = 'customer@demo.local';
const DEMO_PASSWORD = 'demo123456';

type PayoutStatus =
  | 'unlinked'
  | 'currently_due'
  | 'pending_verification'
  | 'payouts_enabled'
  | 'past_due'
  | 'restricted';

type StripeStatusFixture = {
  accountId: string | null;
  tier: string;
  payoutsEnabled: boolean;
  payoutStatus: PayoutStatus;
};

async function signIn(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(CUSTOMER_EMAIL);
  await page.locator('input[type="password"]').fill(DEMO_PASSWORD);
  await page.locator('form').getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
}

async function mockWalletSummary(page: Page, earningsSen: number) {
  await page.route('**/api/wallet/summary', (route) => route.fulfill({
    json: {
      data: {
        topupSen: 0,
        earningsSen,
        pendingEarningsSen: 0,
        reservedEarningsSen: 0,
        withdrawnEarningsSen: 0,
      },
      error: null,
    },
  }));
}

async function mockDestinations(page: Page, options?: { tng?: boolean }) {
  const tng = options?.tng === true;
  await page.route('**/api/wallet/destinations', (route) => route.fulfill({
    json: {
      data: {
        destinations: tng ? [{
          id: '11111111-1111-4111-8111-111111111111',
          type: 'e_wallet',
          provider: 'tng_direct_credit',
          displayLabel: 'TNG eWallet · •••• 6789',
          status: 'verified',
          isDefault: true,
          cooldownUntil: null,
        }] : [],
        capabilities: {
          bank_account: { enabled: true, provider: 'stripe_connect' },
          e_wallet: { enabled: tng, provider: 'tng_direct_credit' },
        },
      },
      error: null,
    },
  }));
}

async function openWalletAfterHistoryLoads(page: Page) {
  const historyLoaded = page.waitForResponse((response) => (
    response.url().includes('/rest/v1/withdrawal_requests')
      && response.request().method() === 'GET'
      && response.status() === 200
  ));

  await page.goto('/customer/wallet');
  await historyLoaded;
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  await expect(page.getByRole('heading', { name: 'My Wallet' })).toBeVisible();
}

test.describe('Customer Stripe JIT withdrawal browser flows', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/rest/v1/withdrawal_requests*', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': '0-0/0' },
      body: '[]',
    }));
  });

  test('zero-earnings customer can use Top Up without seeing or calling Connect', async ({ page }) => {
    let connectRequests = 0;
    await mockWalletSummary(page, 0);
    await mockDestinations(page);
    await page.route('**/api/stripe/connect-status', (route) => {
      connectRequests += 1;
      return route.fulfill({ status: 500, json: { error: { message: 'Connect must remain hidden' } } });
    });

    await signIn(page);
    await openWalletAfterHistoryLoads(page);
    await expect(page.getByText('Set up earnings withdrawals (optional)')).toHaveCount(0);

    await page.getByRole('button', { name: 'Top Up' }).click();
    await expect(page.getByRole('heading', { name: 'Top Up via Card' })).toBeVisible();
    expect(connectRequests).toBe(0);

    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: 'Withdraw', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Request Withdrawal' })).toBeVisible();
    await expect(page.locator('p[role="alert"]')).toContainText('do not have available earnings');
    await expect(page.getByRole('button', { name: 'Submit Request' })).toBeDisabled();
    await expect(page.getByText('Set up earnings withdrawals (optional)')).toHaveCount(0);
    expect(connectRequests).toBe(0);
  });

  test('RM50 automatically reveals setup and completes the hosted-return simulation', async ({ page }) => {
    let payoutStatus: PayoutStatus = 'unlinked';
    let accountId: string | null = null;
    let onboardRequests = 0;
    await mockWalletSummary(page, 5000);
    await mockDestinations(page);
    await page.route('**/api/stripe/connect-status', (route) => route.fulfill({
      json: {
        data: {
          accountId,
          tier: 'kyc_verified',
          payoutsEnabled: payoutStatus === 'payouts_enabled',
          payoutStatus,
        } satisfies StripeStatusFixture,
        error: null,
      },
    }));
    await page.route('**/api/stripe/connect-onboard', (route) => {
      onboardRequests += 1;
      payoutStatus = 'pending_verification';
      accountId = 'acct_browser_test';
      return route.fulfill({ json: { url: 'http://localhost:3000/customer/wallet?onboarding=complete' } });
    });

    await signIn(page);
    await openWalletAfterHistoryLoads(page);
    await expect(page.getByText('Set up earnings withdrawals (optional)')).toBeVisible();
    await page.getByRole('button', { name: 'Set up withdrawals' }).click();

    await page.waitForURL('**/customer/wallet?onboarding=complete');
    await expect(page.getByText('Bank account setup submitted.')).toBeVisible();
    await expect(page.getByText('Stripe verification in progress')).toBeVisible();
    await expect(page.getByText('Stripe is reviewing your payout information. No action is needed.')).toBeVisible();
    expect(onboardRequests).toBe(1);
  });

  test('positive earnings below RM50 reveal Stripe only after Withdraw is clicked', async ({ page }) => {
    let connectRequests = 0;
    await mockWalletSummary(page, 1000);
    await mockDestinations(page);
    await page.route('**/api/stripe/connect-status', (route) => {
      connectRequests += 1;
      return route.fulfill({ json: { data: {
        accountId: null,
        tier: 'kyc_verified',
        payoutsEnabled: false,
        payoutStatus: 'unlinked',
      } satisfies StripeStatusFixture, error: null } });
    });

    await signIn(page);
    await openWalletAfterHistoryLoads(page);
    await expect(page.getByText('Set up earnings withdrawals (optional)')).toHaveCount(0);
    expect(connectRequests).toBe(0);

    await page.getByRole('button', { name: 'Withdraw', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Set up earnings withdrawals' })).toBeVisible();
    await expect(page.getByText('Set up earnings withdrawals (optional)')).toBeVisible();
    expect(connectRequests).toBe(1);
  });

  test('MyWisata KYC blocks Stripe onboarding before any account setup request', async ({ page }) => {
    let onboardRequests = 0;
    await mockWalletSummary(page, 5000);
    await mockDestinations(page);
    await page.route('**/api/stripe/connect-status', (route) => route.fulfill({ json: { data: {
      accountId: null,
      tier: 'profile_complete',
      payoutsEnabled: false,
      payoutStatus: 'unlinked',
    } satisfies StripeStatusFixture, error: null } }));
    await page.route('**/api/stripe/connect-onboard', (route) => {
      onboardRequests += 1;
      return route.fulfill({ status: 403, json: { error: 'KYC required' } });
    });

    await signIn(page);
    await openWalletAfterHistoryLoads(page);
    await expect(page.getByText('Complete MyWisata KYC first')).toBeVisible();
    await page.getByRole('button', { name: 'Withdraw', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Complete MyWisata KYC first' })).toBeVisible();
    await expect(page.getByText('You need to complete KYC verification before setting up a payout account.')).toBeVisible();
    expect(onboardRequests).toBe(0);
  });

  test('renders currently-due, pending, enabled, past-due, and restricted Stripe states accurately', async ({ page }) => {
    let status: PayoutStatus = 'currently_due';
    await mockWalletSummary(page, 5000);
    await mockDestinations(page);
    await page.route('**/api/stripe/connect-status', (route) => route.fulfill({ json: { data: {
      accountId: 'acct_browser_test',
      tier: 'kyc_verified',
      payoutsEnabled: status === 'payouts_enabled',
      payoutStatus: status,
    } satisfies StripeStatusFixture, error: null } }));

    await signIn(page);
    await openWalletAfterHistoryLoads(page);
    await expect(page.getByText('Please complete your payout details')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Update details' })).toBeVisible();

    status = 'pending_verification';
    await page.reload();
    await expect(page.getByText('Stripe verification in progress')).toBeVisible();
    await expect(page.getByText('No action is needed.')).toBeVisible();

    status = 'payouts_enabled';
    await page.reload();
    await expect(page.getByText('Bank withdrawals enabled')).toBeVisible();

    status = 'past_due';
    await page.reload();
    await expect(page.getByText('Bank withdrawals temporarily restricted')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Update details' })).toBeVisible();

    status = 'restricted';
    await page.reload();
    await expect(page.getByText('Bank withdrawals temporarily restricted')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry status check' })).toBeVisible();
  });

  test('verified TNG destination opens Withdraw without calling Stripe Connect', async ({ page }) => {
    let connectRequests = 0;
    await mockWalletSummary(page, 1000);
    await mockDestinations(page, { tng: true });
    await page.route('**/api/stripe/connect-status', (route) => {
      connectRequests += 1;
      return route.fulfill({ status: 500, json: { error: { message: 'Stripe must not be called for TNG' } } });
    });

    await signIn(page);
    await openWalletAfterHistoryLoads(page);
    await page.getByRole('button', { name: 'Withdraw', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Request Withdrawal' })).toBeVisible();
    await expect(page.getByRole('combobox')).toHaveValue('11111111-1111-4111-8111-111111111111');
    await expect(page.getByText('Set up earnings withdrawals', { exact: true })).toHaveCount(0);
    expect(connectRequests).toBe(0);
  });
});
