import { test, expect } from '@playwright/test';

/**
 * E2E tests — real user journeys through the browser UI:
 *   5. Admin Soft Delete  (admin/users → drawer → soft delete)
 *   6. User Suspension Appeal  (/account-suspended form)
 *   7. Gemini Unavailable  (503 fail-closed, requires invalid key + restart)
 *   8. Regular Support Ticket  (/customer/support or API)
 *
 * Pre-conditions:
 *   - npm run dev running on localhost:3000
 *   - Database seeded (supabase db push + seed)
 *   - admin@demo.local has super_admin role
 *   - At least two customer accounts exist so the deletion test
 *     doesn't remove the account used for appeal tests.
 *
 * Test 7 pre-conditions (run in isolation):
 *   1. Set GOOGLE_AI_KEY=invalid-test-key in .env.local
 *   2. Restart npm run dev
 *   3. Run: npx playwright test admin-user-management --grep "Gemini"
 *   4. Restore correct key and restart.
 */

const ADMIN_EMAIL    = 'admin@demo.local';
const ADMIN_PASS     = 'demo123456';
const CUSTOMER_EMAIL = 'customer@demo.local';
const CUSTOMER_PASS  = 'demo123456';

// ─── Auth helpers ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function signInViaForm(page: any, email: string, password: string) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('form').getByRole('button', { name: /^sign in$/i }).click();
  // Wait until we land somewhere other than /login
  await page.waitForURL((url: URL) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
}

// ─── 5. Admin Soft Delete ─────────────────────────────────────────────────────
test.describe('5. Admin Soft Delete', () => {

  test('violation reason → Gemini rejects, error shown in drawer, user still active', async ({ page }) => {
    await signInViaForm(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.goto('/admin/users');

    // Wait for the user table to load
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 10_000 });

    // Click the first customer row to open the drawer
    await page.locator('table tbody tr').first().click();

    // Drawer should open
    const drawer = page.getByRole('dialog', { name: 'User details' });
    await expect(drawer).toBeVisible({ timeout: 5_000 });

    // Click "Soft delete" button inside the drawer
    const softDeleteBtn = drawer.getByRole('button', { name: /soft delete/i });
    test.skip(!(await softDeleteBtn.isVisible()), 'User is not in active state — choose a different target.');
    await softDeleteBtn.click();

    // Reason textarea should appear
    const reasonBox = drawer.locator('textarea[placeholder="Reason for this action"]');
    await expect(reasonBox).toBeVisible();

    // Enter violating content
    await reasonBox.fill('I will harass the user and publish their private information.');

    await drawer.getByRole('button', { name: /review action/i }).click();
    await drawer.getByRole('alertdialog').getByRole('button', { name: /confirm action/i }).click();

    // Error alert should appear in the drawer
    const alertMsg = drawer.locator('[role="alert"]');
    await expect(alertMsg).toBeVisible({ timeout: 8_000 });
    await expect(alertMsg).toContainText(/disallowed content|content.?rejected/i);

    // User status badge should still say "active"
    await expect(drawer.getByText('active', { exact: true })).toBeVisible();
  });

  test('valid policy reason → drawer shows "deleted", restore button appears', async ({ page }) => {
    await signInViaForm(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.goto('/admin/users');
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 10_000 });

    // Search for a non-primary customer to avoid deleting CUSTOMER_EMAIL
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const searchInput = page.locator('input[placeholder*="Search"]');
    // Try to find a row that is NOT customer@demo.local
    const rows = page.locator('table tbody tr');
    const rowCount = await rows.count();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let targetRow: any = null;
    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i);
      const text = await row.textContent();
      if (text && !text.includes(CUSTOMER_EMAIL)) { targetRow = row; break; }
    }
    test.skip(!targetRow, 'No secondary customer found — seed at least two customer accounts.');

    await targetRow.click();
    const drawer = page.getByRole('dialog', { name: 'User details' });
    await expect(drawer).toBeVisible({ timeout: 5_000 });

    const softDeleteBtn = drawer.getByRole('button', { name: /soft delete/i });
    test.skip(!(await softDeleteBtn.isVisible()), 'Target user is not active.');
    await softDeleteBtn.click();

    const reasonBox = drawer.locator('textarea[placeholder="Reason for this action"]');
    await expect(reasonBox).toBeVisible();
    await reasonBox.fill('The account is being closed after confirmed policy violations.');

    const reviewBtn = drawer.getByRole('button', { name: /review action/i });
    await expect(reviewBtn).toBeEnabled();
    await reviewBtn.click();
    await drawer.getByRole('alertdialog').getByRole('button', { name: /confirm action/i }).click();

    // Drawer refreshes — status should now be "deleted"
    await expect(drawer.getByText('deleted', { exact: true })).toBeVisible({ timeout: 10_000 });

    // "Restore" button should appear; "Soft delete" should be gone
    await expect(drawer.getByRole('button', { name: /restore/i })).toBeVisible();
    await expect(drawer.getByRole('button', { name: /soft delete/i })).toBeHidden();
  });

});

// ─── 6. User Suspension Appeal ────────────────────────────────────────────────
test.describe('6. User Suspension Appeal', () => {

  test('valid appeal → success state shows ticket ID and "View ticket" link', async ({ page }) => {
    await signInViaForm(page, CUSTOMER_EMAIL, CUSTOMER_PASS);
    await page.goto('/account-suspended');

    const textarea  = page.locator('textarea');
    const submitBtn = page.getByRole('button', { name: /submit appeal/i });

    await expect(textarea).toBeVisible({ timeout: 5_000 });

    // Fill valid appeal message
    await textarea.fill('I believe this suspension was applied by mistake and request a manual review.');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Success state: "Appeal submitted" + ticket ID visible
    await expect(page.getByText(/appeal submitted/i)).toBeVisible({ timeout: 10_000 });

    // "View ticket" link should appear and point to /customer/support/{id}
    const viewLink = page.getByRole('link', { name: /view ticket/i });
    await expect(viewLink).toBeVisible();
    const href = await viewLink.getAttribute('href');
    expect(href).toMatch(/\/customer\/support\/.+/);

    // Navigate to the ticket and verify subject is "Account suspension appeal"
    await viewLink.click();
    await expect(page.getByText('Account suspension appeal')).toBeVisible({ timeout: 8_000 });
  });

  test('short appeal (fewer than 10 chars) → submit button stays disabled', async ({ page }) => {
    await signInViaForm(page, CUSTOMER_EMAIL, CUSTOMER_PASS);
    await page.goto('/account-suspended');

    const textarea  = page.locator('textarea');
    const submitBtn = page.getByRole('button', { name: /submit appeal/i });

    // Initially disabled
    await expect(submitBtn).toBeDisabled();

    // 7 chars — still disabled
    await textarea.fill('Help me');
    await expect(submitBtn).toBeDisabled();

    // Exactly 9 chars — still disabled
    await textarea.fill('123456789');
    await expect(submitBtn).toBeDisabled();

    // 10+ chars — now enabled
    await textarea.fill('Please help me with my account suspension.');
    await expect(submitBtn).toBeEnabled();
  });

  test('violation content in appeal → error shown, form stays visible (no ticket created)', async ({ page }) => {
    await signInViaForm(page, CUSTOMER_EMAIL, CUSTOMER_PASS);
    await page.goto('/account-suspended');

    const textarea  = page.locator('textarea');
    const submitBtn = page.getByRole('button', { name: /submit appeal/i });

    await textarea.fill('I will threaten the support team if you do not restore my account.');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Error message should appear
    await expect(
      page.getByText(/disallowed content|content.?rejected|unable to submit/i),
    ).toBeVisible({ timeout: 10_000 });

    // Page must still show the form (not the success state)
    await expect(page.getByText(/appeal submitted/i)).toBeHidden();
    await expect(textarea).toBeVisible();
  });

  test('short appeal via API → 422 validation error', async ({ page }) => {
    await signInViaForm(page, CUSTOMER_EMAIL, CUSTOMER_PASS);

    const res = await page.request.post('/api/account-suspended/appeal', {
      data: { body: 'Help' },
    });
    expect(res.status()).toBe(422);
  });

});

// ─── 7. Gemini Unavailable ────────────────────────────────────────────────────
// Requires GOOGLE_AI_KEY=invalid-test-key in .env.local + npm run dev restart.
// Tests auto-skip if Gemini appears available.
test.describe('7. Gemini Unavailable', () => {

  test('soft_delete returns 503, user remains active', async ({ page }) => {
    await signInViaForm(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.goto('/admin/users');
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 10_000 });

    await page.locator('table tbody tr').first().click();
    const drawer = page.getByRole('dialog', { name: 'User details' });
    await expect(drawer).toBeVisible({ timeout: 5_000 });

    const softDeleteBtn = drawer.getByRole('button', { name: /soft delete/i });
    test.skip(!(await softDeleteBtn.isVisible()), 'User is not active.');
    await softDeleteBtn.click();

    const reasonBox = drawer.locator('textarea[placeholder="Reason for this action"]');
    await reasonBox.fill('The account is being closed after confirmed policy violations.');

    page.once('dialog', (dialog) => dialog.accept());
    await drawer.getByRole('button', { name: /confirm action/i }).click();

    // Error alert must appear
    const alertMsg = drawer.locator('[role="alert"]');
    await expect(alertMsg).toBeVisible({ timeout: 10_000 });

    // If Gemini is working, alert shows "disallowed content" — this test is not applicable.
    const alertText = (await alertMsg.textContent()) ?? '';
    test.skip(
      /disallowed content/i.test(alertText),
      'Gemini is available — set GOOGLE_AI_KEY=invalid-test-key and restart to run this test.',
    );

    // When Gemini is down, alert should say something about review/moderation unavailable
    await expect(alertMsg).toContainText(/unavailable|review.*service|moderation/i);

    // User status must still be "active"
    await expect(drawer.getByText('active', { exact: true })).toBeVisible();
  });

  test('suspension appeal returns 503 via API', async ({ page }) => {
    await signInViaForm(page, CUSTOMER_EMAIL, CUSTOMER_PASS);

    const res = await page.request.post('/api/account-suspended/appeal', {
      data: { body: 'I believe this suspension was applied by mistake and request a manual review.' },
    });

    test.skip(
      res.status() === 201,
      'Gemini is available — set GOOGLE_AI_KEY=invalid-test-key and restart.',
    );

    expect(res.status()).toBe(503);
    const body = await res.json();
    expect(body.error?.code).toBe('MODERATION_UNAVAILABLE');
  });

});

// ─── 8. Regular Support Ticket ────────────────────────────────────────────────
test.describe('8. Regular Support Ticket not affected', () => {

  test('submits normally and ticket is visible in support list', async ({ page }) => {
    await signInViaForm(page, CUSTOMER_EMAIL, CUSTOMER_PASS);

    // Create ticket via API (regular support, no moderation gate)
    const res = await page.request.post('/api/support/tickets', {
      data: {
        subject: 'I cannot find my booking confirmation',
        body:    'I cannot find my booking confirmation. Please help me locate it.',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    const ticketId: string = body.data?.id;
    expect(ticketId).toBeTruthy();

    const detailResponse = await page.request.get(`/api/support/tickets/${ticketId}`);
    expect(detailResponse.status()).toBe(200);
    const detailBody = await detailResponse.json();
    expect(detailBody.data?.subject).toBe('I cannot find my booking confirmation');

    // Navigate to the ticket detail page and verify it renders
    await page.goto(`/customer/support/${ticketId}`);
    await expect(
      page.getByRole('heading', { name: 'I cannot find my booking confirmation' }),
    ).toBeVisible({ timeout: 8_000 });
  });

  test('regular ticket still succeeds even when Gemini is down (keyword fallback)', async ({ page }) => {
    // classifyTicketSmart falls back to keyword classifier — never calls moderateAccountText.
    // So a regular ticket must always return 201, regardless of GOOGLE_AI_KEY validity.
    await signInViaForm(page, CUSTOMER_EMAIL, CUSTOMER_PASS);

    const res = await page.request.post('/api/support/tickets', {
      data: {
        subject: 'Payment issue with my order',
        body:    'I was charged twice for the same order. Please investigate.',
      },
    });
    // Must be 201 — never 503
    expect(res.status()).toBe(201);
    expect((await res.json()).data?.id).toBeTruthy();
  });

});
