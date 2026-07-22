import { test, expect } from '@playwright/test';

/**
 * Verifies the recommendation rate limit enforced by the submit_recommendation RPC
 * (advisory lock + 5/day count check — PR 019).
 *
 * Strategy: use page.request (same cookie jar as the browser session) to fire
 * 5 API calls fast, then attempt a 6th via the UI form to verify the error message.
 */

const CUSTOMER_EMAIL = 'customer@demo.local';
const CUSTOMER_PASS  = 'demo123456';

test.describe('Recommendation rate limit (PR 019)', () => {
  test('6th submission within 24 h is rejected with RATE_LIMITED', async ({ page }) => {
    // ── 1. Sign in ──────────────────────────────────────────────────────────
    await page.goto('/login');
    await page.locator('input[type="email"]').fill(CUSTOMER_EMAIL);
    await page.locator('input[type="password"]').fill(CUSTOMER_PASS);
    await page.locator('form').getByRole('button', { name: /^sign in$/i }).click();
    await page.waitForURL(/\/customer(?:\/|$)/);

    // ── 2. Fire 5 submissions via API (same cookie jar = same auth session) ─
    // Using unique names to avoid duplicate detection
    const ts = Date.now();
    for (let i = 0; i < 5; i++) {
      const res = await page.request.post('/api/recommendations', {
        data: {
          vendorName:  `PW Test Vendor ${ts}-${i}`,
          description: 'Playwright test vendor for rate limit verification.',
          state:       'Selangor',
        },
      });
      // Accept success (201) or already-at-limit (429) — test may run
      // after earlier submissions exist in the same day.
      expect([201, 429]).toContain(res.status());
      if (res.status() === 429) {
        // Already hit limit from prior test run — skip to UI check.
        break;
      }
    }

    // ── 3. Attempt 6th via API — must be rate-limited ─────────────────────
    const sixthRes = await page.request.post('/api/recommendations', {
      data: {
        vendorName:  `PW Test Vendor ${ts}-OVER`,
        description: 'This 6th submission should be blocked by rate limit.',
        state:       'Johor',
      },
    });
    expect(sixthRes.status()).toBe(429);
    const body = await sixthRes.json();
    expect(body.error?.code ?? body.code ?? '').toMatch(/RATE_LIMITED/i);

    // ── 4. Navigate to recommendations page and verify UI error ───────────
    await page.goto('/customer/recommendations');
    await page.getByRole('button', { name: 'Recommend', exact: true }).click();

    // Fill form
    await page.getByPlaceholder(/Aunty Lim's Nyonya Kitchen/i).fill(`PW Test Vendor ${ts}-UI`);
    await page.getByPlaceholder(/Describe what makes this vendor special/i).fill(
      'This submission should be blocked by the daily rate limit and show an error in the UI.',
    );
    // State might be a select or input
    const stateField = page.locator('select').last();
    if (await stateField.getAttribute('role') === 'combobox' || await stateField.evaluate(el => el.tagName) === 'SELECT') {
      await stateField.selectOption({ label: 'Selangor' });
    } else {
      await stateField.fill('Selangor');
    }

    await page.getByRole('button', { name: /submit recommendation/i }).click();

    // Expect rate-limit error to appear in UI
    await expect(
      page.getByText(/daily recommendation limit|try again tomorrow|rate.?limit/i)
    ).toBeVisible({ timeout: 5_000 });
  });
});
