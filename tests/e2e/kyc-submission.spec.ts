import { expect, test } from '@playwright/test';
import { signIn } from './helpers/demo';

const CUSTOMER_EMAIL = 'customer@demo.local';
const VALID_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9WAAAAABJRU5ErkJggg==', 'base64');

async function signInAsCustomer(page: import('@playwright/test').Page) {
  await signIn(page, CUSTOMER_EMAIL);
}

test.describe('KYC submission', () => {
  test('requires both valid document sides and submits the dual-file contract', async ({ page }) => {
    await page.route('**/api/kyc/submission', (route) => route.fulfill({ json: { data: { submission: null } } }));
    let uploadBody = '';
    await page.route('**/api/kyc/upload', async (route) => {
      uploadBody = route.request().postData() ?? '';
      await route.fulfill({ status: 201, json: { data: { submissionId: '00000000-0000-4000-8000-000000000001', status: 'pending' } } });
    });

    await signInAsCustomer(page);
    await page.goto('/customer/kyc');

    const submit = page.getByRole('button', { name: 'Submit for review' });
    await expect(submit).toBeDisabled();
    await page.getByLabel(/IC \/ Passport Number/i).fill('900101145678');
    await page.getByLabel(/front of document/i).setInputFiles({ name: 'front.png', mimeType: 'image/png', buffer: VALID_PNG });
    await expect(submit).toBeDisabled();
    await page.getByLabel(/back of document/i).setInputFiles({ name: 'back.png', mimeType: 'image/png', buffer: VALID_PNG });
    await page.getByRole('checkbox').check();
    await expect(submit).toBeEnabled();

    await submit.click();
    await expect.poll(() => uploadBody).toContain('frontFile');
    expect(uploadBody).toContain('backFile');
  });

  test('lets the customer correct OCR fields before the confirmed values are submitted', async ({ page }) => {
    await page.route('**/api/kyc/submission', (route) => route.fulfill({ json: { data: { submission: null } } }));
    await page.route('**/api/kyc/draft', async (route) => {
      if (route.request().method() === 'GET') return route.fulfill({ json: { data: { draft: null } } });
      return route.fulfill({ json: { data: { draft: {
        id: '00000000-0000-4000-8000-000000000003', version: 1, holderName: 'OCR NAME', documentType: 'national_id', expiresAt: '2026-11-03T00:00:00.000Z',
      } } } });
    });
    await page.route('**/api/kyc/preview', (route) => route.fulfill({ json: { data: { preview: {
      status: 'extracted', holderName: 'OCR NAME', documentNumber: '900101145678',
    } } } }));
    let uploadBody = '';
    await page.route('**/api/kyc/upload', async (route) => {
      uploadBody = route.request().postData() ?? '';
      await route.fulfill({ status: 201, json: { data: { submissionId: '00000000-0000-4000-8000-000000000004', status: 'pending' } } });
    });

    await signInAsCustomer(page);
    await page.goto('/customer/kyc');
    await page.getByLabel(/front of document/i).setInputFiles({ name: 'front.png', mimeType: 'image/png', buffer: VALID_PNG });
    await page.getByLabel(/back of document/i).setInputFiles({ name: 'back.png', mimeType: 'image/png', buffer: VALID_PNG });
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Read document' }).click();

    const nameField = page.getByLabel('Name on document');
    const numberField = page.getByLabel('IC / Passport number');
    await expect(nameField).toHaveValue('OCR NAME');
    await expect(numberField).toHaveValue('900101145678');
    await nameField.fill('CORRECTED NAME');
    await numberField.fill('910202105432');
    await page.getByRole('button', { name: 'Submit for review' }).click();
    await expect.poll(() => uploadBody).toContain('CORRECTED NAME');
    expect(uploadBody).toContain('910202105432');
    expect(uploadBody).not.toContain('OCR NAME');
    expect(uploadBody).not.toContain('900101145678');
  });

  test('renders a deterministic rejected submission with safe recovery details', async ({ page }) => {
    // Browser route fixture isolates status rendering from database state while
    // exercising the real page/API response contract. It never simulates an
    // upload validation error as a rejection.
    await page.route('**/api/kyc/submission', (route) => route.fulfill({ json: {
      data: { submission: {
        id: '00000000-0000-4000-8000-000000000002', status: 'rejected', docType: 'national_id', queuePosition: null,
        submittedAt: '2026-07-14T09:00:00.000Z', reviewedAt: '2026-07-14T10:30:00.000Z',
        reviewReasonCode: 'document_unreadable', reviewReasonDetail: 'The front image is too blurry to verify.',
      } },
    } }));

    await signInAsCustomer(page);
    await page.goto('/customer/kyc');

    await expect(page.getByText('KYC Submission Rejected')).toBeVisible();
    await expect(page.getByText('We could not clearly read your document. Please submit clear, well-lit images.', { exact: true })).toBeVisible();
    await expect(page.getByText('Reviewer note: The front image is too blurry to verify.')).toBeVisible();
    await expect(page.getByText(/^Reviewed /)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start New Submission' })).toBeVisible();
  });
});
