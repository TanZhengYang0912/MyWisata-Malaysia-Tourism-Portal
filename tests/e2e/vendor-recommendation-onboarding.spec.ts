import { expect, test, type Page } from '@playwright/test';

const INVITE_TOKEN = 'playwright-vendor-invite-token-000001';
const CATEGORY_ID = '11111111-1111-4111-8111-111111111111';

function preview(phoneVerified: boolean) {
  return {
    account: {
      authenticated: true,
      emailMatched: true,
      phoneVerified,
      maskedInviteEmail: 'v***@example.com',
      maskedVerifiedPhone: phoneVerified ? '******6789' : null,
    },
    categories: [{ id: CATEGORY_ID, name: 'Activity', slug: 'activity' }],
    authenticated: true,
    emailMatched: true,
    phoneVerified,
    recommendation: {
      businessName: 'Guided Test Vendor',
      description: 'A recommendation supplied by a customer.',
      whyRecommend: 'Helpful local experience.',
      categoryId: CATEGORY_ID,
      categoryName: 'Activity',
      category: 'Activity',
      locationName: 'Guided Test Outlet',
      formattedAddress: '1 Test Street, Kuala Lumpur',
      latitude: 3.139,
      longitude: 101.687,
      images: [],
    },
    maskedContact: { email: 'v***@example.com', phone: '******1111' },
    prefill: {
      businessName: 'Guided Test Vendor',
      legalBusinessName: 'Guided Test Vendor Sdn Bhd',
      description: 'A recommendation supplied by a customer.',
      categoryId: CATEGORY_ID,
      outletName: 'Guided Test Outlet',
      businessType: 'Activity',
      contactEmail: 'vendor@example.com',
      contactPhone: '+60311111111',
      businessAddress: '1 Test Street, Kuala Lumpur',
      latitude: 3.139,
      longitude: 101.687,
    },
  };
}

async function mockPreview(page: Page, getPhoneVerified: () => boolean) {
  await page.route('**/api/vendor-invite/preview', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: preview(getPhoneVerified()), error: null }),
    });
  });
}

async function openInvite(page: Page) {
  const path = `/vendor-invite?recommendation=${INVITE_TOKEN}`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      await page.waitForTimeout(500);
    }
  }
}

async function reachFinalReview(page: Page) {
  await openInvite(page);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Vendor brand' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Review your application' })).toBeVisible();
}

test('verified invite skips phone OTP and recovers when claim requires verification', async ({ page }) => {
  await mockPreview(page, () => true);
  let sendOtpRequests = 0;
  await page.route('**/api/phone/send-otp', async (route) => {
    sendOtpRequests += 1;
    await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
  });
  await page.route('**/api/vendor/claim', async (route) => {
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ data: null, error: { code: 'PHONE_VERIFICATION_REQUIRED', message: 'Internal detail must stay hidden' } }),
    });
  });

  await reachFinalReview(page);
  expect(sendOtpRequests).toBe(0);
  await page.getByRole('checkbox', { name: /authorized to represent/i }).check();
  await page.getByRole('button', { name: 'Submit application' }).click();

  await expect(page.getByRole('heading', { name: 'Verify your personal mobile' })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Verify your personal mobile before submitting' })).toBeVisible();
  await expect(page.getByText('Internal detail must stay hidden')).toHaveCount(0);
  expect(sendOtpRequests).toBe(0);
});

test('unverified invite completes inline OTP without persisting personal secrets', async ({ page }) => {
  let phoneVerified = false;
  let claimBody: Record<string, unknown> | null = null;
  await mockPreview(page, () => phoneVerified);
  await page.route('**/api/phone/send-otp', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { sent: true }, error: null }) });
  });
  await page.route('**/api/phone/verify-otp', async (route) => {
    phoneVerified = true;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { verified: true }, error: null }) });
  });
  await page.route('**/api/vendor/claim', async (route) => {
    claimBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { claimed: true }, error: null }) });
  });

  await openInvite(page);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Verify your personal mobile' })).toBeVisible();

  await page.getByLabel('Personal mobile number').fill('+60123456789');
  await page.getByRole('button', { name: 'Send phone OTP' }).click();
  for (const [index, digit] of [...'123456'].entries()) {
    await page.getByLabel(`OTP digit ${index + 1}`).fill(digit);
  }
  await page.getByRole('button', { name: 'Verify phone OTP' }).click();
  await expect(page.getByRole('heading', { name: 'Review your application' })).toBeVisible();

  const storedDrafts = await page.evaluate(() => Object.values(window.sessionStorage));
  expect(storedDrafts.join('\n')).not.toContain('+60123456789');
  expect(storedDrafts.join('\n')).not.toContain('123456');

  await page.getByRole('checkbox', { name: /authorized to represent/i }).check();
  await page.getByRole('button', { name: 'Submit application' }).click();
  await expect(page.getByRole('heading', { name: 'Vendor application submitted' })).toBeVisible();
  expect(claimBody).toMatchObject({ contactPhone: '+60311111111' });
});
