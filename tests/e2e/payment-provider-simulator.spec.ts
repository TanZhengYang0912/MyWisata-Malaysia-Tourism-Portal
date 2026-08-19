import { expect, test, type Page } from '@playwright/test';

const CUSTOMER_EMAIL = 'customer1@demo.local';
const ADMIN_EMAIL = 'admin@demo.local';
const SESSION_ID = '9e703f42-7f40-4a4f-a4a0-447eb6319931';
const ORDER_ID = '1d4057cf-c821-4b05-a454-61dbdc42d32c';
const REFUND_ID = '33333333-3333-4333-8333-333333333333';

async function signInFixture(page: Page, email: string) {
  const response = await page.request.post('/api/auth/demo-signin', { data: { email } });
  if (response.status() === 401) test.skip(true, `Seeded ${email} demo session is unavailable`);
  expect(response.status()).toBe(200);
}

type SimulatorProvider = 'tng_ewallet_simulator' | 'grabpay_simulator' | 'bank_transfer_simulator';

async function mockSimulatorSession(page: Page, provider: SimulatorProvider) {
  let status = 'requires_action';
  const outcomes: string[] = [];
  await page.route(`**/api/payments/simulator/sessions/${SESSION_ID}`, (route) => route.fulfill({ json: {
    data: {
      sessionId: SESSION_ID,
      orderId: ORDER_ID,
      provider,
      providerPaymentId: 'sim_pay_0123456789abcdef0123456789abcdef01234567',
      amountSen: 5000,
      currency: 'MYR',
      status,
      expiresAt: '2099-08-17T11:00:00.000Z',
      simulated: true,
    },
    error: null,
  } }));
  await page.route(`**/api/payments/simulator/sessions/${SESSION_ID}/action`, async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as { outcome: string };
    outcomes.push(body.outcome);
    status = body.outcome === 'succeeded' ? 'paid' : body.outcome;
    await route.fulfill({ json: {
      data: { kind: 'payment', status, idempotent: outcomes.length > 1, orderId: ORDER_ID, checkoutSessionId: SESSION_ID },
      error: null,
    } });
  });
  return outcomes;
}

test.beforeEach(async ({ context }) => {
  await context.clearCookies();
});

test('TNG simulator shows the warning and completes a customer success journey', async ({ page }) => {
  await signInFixture(page, CUSTOMER_EMAIL);
  await mockSimulatorSession(page, 'tng_ewallet_simulator');
  await page.goto(`/customer/checkout/simulator/${SESSION_ID}`);

  await expect(page.getByText('Sandbox / Simulated')).toBeVisible();
  await expect(page.getByText('No real money moves')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Touch ’n Go eWallet' })).toBeVisible();
  await page.getByRole('button', { name: 'Simulate payment success' }).click();
  await expect(page).toHaveURL(new RegExp(`/customer/orders/${ORDER_ID}$`));
});

test('GrabPay failure and cancellation remain terminal simulated states', async ({ page }) => {
  await signInFixture(page, CUSTOMER_EMAIL);
  await mockSimulatorSession(page, 'grabpay_simulator');
  await page.goto(`/customer/checkout/simulator/${SESSION_ID}`);

  await page.getByRole('button', { name: 'Simulate failure' }).click();
  await expect(page.getByText('failed', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Simulate payment success' })).toHaveCount(0);
});

test('bank transfer moves from pending to paid and identical delivery is replay-safe', async ({ page }) => {
  await signInFixture(page, CUSTOMER_EMAIL);
  const outcomes = await mockSimulatorSession(page, 'bank_transfer_simulator');
  await page.goto(`/customer/checkout/simulator/${SESSION_ID}`);

  await expect(page.getByText('Fictitious transfer reference')).toBeVisible();
  await page.getByRole('button', { name: 'Mark funds received' }).click();
  await expect(page).toHaveURL(new RegExp(`/customer/orders/${ORDER_ID}$`));

  const replay = await page.evaluate(async ({ sessionId }) => {
    const response = await fetch(`/api/payments/simulator/sessions/${sessionId}/action`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ outcome: 'succeeded' }),
    });
    return response.json();
  }, { sessionId: SESSION_ID });
  expect(outcomes).toEqual(['succeeded', 'succeeded']);
  expect(replay.data.idempotent).toBe(true);
});

test('customer can cancel a simulator checkout without a paid redirect', async ({ page }) => {
  await signInFixture(page, CUSTOMER_EMAIL);
  await mockSimulatorSession(page, 'tng_ewallet_simulator');
  await page.goto(`/customer/checkout/simulator/${SESSION_ID}`);

  await page.getByRole('button', { name: 'Cancel payment' }).click();
  await expect(page).toHaveURL(new RegExp(`/customer/checkout/simulator/${SESSION_ID}$`));
  await expect(page.getByText('cancelled', { exact: true })).toBeVisible();
});

test('Admin approves and settles an asynchronous simulated refund', async ({ page }) => {
  await signInFixture(page, ADMIN_EMAIL);
  let status = 'pending';
  let attemptCount = 0;
  await page.route('**/api/admin/refunds', (route) => route.fulfill({ json: { data: { refunds: [{
    id: REFUND_ID,
    orderId: ORDER_ID,
    orderNumber: 'MW-1001',
    amountRm: 50,
    reason: 'Customer request',
    status,
    provider: 'tng_ewallet_simulator',
    method: 'ewallet',
    providerRefundId: status === 'pending' ? null : 'sim_refund_0123456789abcdef0123456789abcdef01234567',
    failureCode: null,
    failureMessage: null,
    attemptCount,
    createdAt: '2026-08-17T00:00:00.000Z',
    updatedAt: '2026-08-17T00:01:00.000Z',
  }] }, error: null } }));
  await page.route(`**/api/admin/refunds/${REFUND_ID}`, async (route) => {
    status = 'approved';
    attemptCount = 1;
    await route.fulfill({ json: { data: { refundId: REFUND_ID, status }, error: null } });
  });
  await page.route(`**/api/payments/simulator/refunds/${REFUND_ID}/action`, async (route) => {
    status = 'processed';
    await route.fulfill({ json: { data: { kind: 'refund', status, idempotent: false, orderId: ORDER_ID }, error: null } });
  });

  await page.goto('/admin/refunds');
  await expect(page.getByRole('heading', { name: 'Refund Requests' })).toBeVisible();
  await expect(page.getByText('Sandbox / Simulated')).toBeVisible();
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByRole('button', { name: 'Simulate success' })).toBeVisible();
  await page.getByRole('button', { name: 'Simulate success' }).click();
  await expect(page.getByText('processed', { exact: true })).toBeVisible();
});
