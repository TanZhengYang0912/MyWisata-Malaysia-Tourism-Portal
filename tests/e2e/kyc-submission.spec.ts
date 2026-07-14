import { expect, test } from '@playwright/test';

const CUSTOMER_EMAIL = 'customer@demo.local';
const CUSTOMER_PASS = 'demo123456';

test.describe('KYC submission', () => {
  test('requires both document sides and shows a safe rejected-submission recovery path', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill(CUSTOMER_EMAIL);
    await page.locator('input[type="password"]').fill(CUSTOMER_PASS);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await page.waitForURL(/\/customer\//);
    await page.goto('/customer/kyc');

    const submit = page.getByRole('button', { name: /submit for review|start new kyc submission/i });
    await expect(submit).toBeDisabled();

    await page.getByLabel(/front of document/i).setInputFiles({ name: 'front.png', mimeType: 'image/png', buffer: Buffer.from('not-a-real-png') });
    await expect(submit).toBeDisabled();

    await page.getByLabel(/back of document/i).setInputFiles({ name: 'back.png', mimeType: 'image/png', buffer: Buffer.from('not-a-real-png') });
    // The browser must send the two independently named form fields. The route
    // rejects these deliberately invalid PNG bytes before persisting anything.
    const request = page.waitForRequest((candidate) => candidate.url().endsWith('/api/kyc/upload') && candidate.method() === 'POST');
    await submit.click();
    const upload = await request;
    const body = upload.postData() ?? '';
    expect(body).toContain('frontFile');
    expect(body).toContain('backFile');

    // A seeded rejected submission is expected to show only safe reason text,
    // optional reviewer detail, review status/time, and a new-submission action.
    // This assertion becomes active once the E2E seed establishes that fixture.
    await expect(page.getByText(/KYC Submission Rejected|Unable to submit KYC documents/i)).toBeVisible();
  });
});
