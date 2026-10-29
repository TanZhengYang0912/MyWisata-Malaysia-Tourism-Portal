import { test, expect, type Page } from '@playwright/test';

// Use a local provider test SITE key. Every Auth/delivery mutation is intercepted.
async function fixtures(page: Page) {
  await page.route('**/api/**', (route) => route.fulfill({ json: { data: null, error: null } }));
  await page.route('**/api/auth/demo-users', (route) => route.fulfill({ json: [] }));
  await page.route('**/auth/v1/**', (route) => route.fulfill({ status: 400, json: { code: 'fixture_only', message: 'Auth fixture' } }));
  await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js*', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: [
      'window.__challengeCallbacks = {}; window.__challengeElements = {}; window.turnstile = { ready: callback => callback(),',
      'render: (element, options) => { const id = String(Math.random()); window.__challengeCallbacks[id] = options; window.__challengeElements[id] = element;',
      'const button = document.createElement("button"); button.type = "button"; button.textContent = "Complete fixture security check";',
      'button.onclick = () => options.callback("fixture-proof-" + id); element.appendChild(button); return id; },',
      'remove: id => { delete window.__challengeCallbacks[id]; window.__challengeElements[id].replaceChildren(); delete window.__challengeElements[id]; } };',
    ].join('\n'),
  }));
}

test('a provider failure clears the proof and retains only its public error code', async ({ page }) => {
  await fixtures(page);
  let signupRequests = 0;
  await page.route('**/auth/v1/signup*', route => { signupRequests += 1; return route.fulfill({ status: 400, json: { message: 'Must not send a stale proof' } }); });
  await page.goto('/login?mode=signup');
  await page.getByPlaceholder('Email address').fill('fixture@example.com');
  await page.getByPlaceholder('Password', { exact: true }).fill('FixturePassword1');
  await page.getByPlaceholder('Confirm password').fill('FixturePassword1');
  await page.getByRole('button', { name: 'Complete fixture security check' }).click();
  await page.evaluate(() => {
    const callbacks = (window as unknown as { __challengeCallbacks: Record<string, Record<string, (code: string) => void>> }).__challengeCallbacks;
    Object.values(callbacks).forEach(entry => entry['error-callback']('110200'));
  });
  await expect(page.locator('[data-human-verification="signup"]')).toHaveAttribute('data-human-verification-error', '110200');
  await page.locator('form').getByRole('button', { name: 'Create account', exact: true }).click();
  expect(signupRequests).toBe(0);
});

test('signup and resend require separate human proofs without sending real email', async ({ page }) => {
  await fixtures(page);
  const sends: Record<string, unknown>[] = [];
  await page.route('**/auth/v1/signup*', async (route) => {
    sends.push(route.request().postDataJSON());
    await route.fulfill({ json: { user: { id: 'fixture-user', email: 'fixture@example.com', identities: [] }, session: null } });
  });
  await page.route('**/auth/v1/resend*', async (route) => {
    sends.push(route.request().postDataJSON());
    await route.fulfill({ json: {} });
  });
  await page.clock.install();
  await page.goto('/login?mode=signup');
  await page.getByPlaceholder('Email address').fill('fixture@example.com');
  await page.getByPlaceholder('Password', { exact: true }).fill('FixturePassword1');
  await page.getByPlaceholder('Confirm password').fill('FixturePassword1');
  await page.locator('form').getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Complete the security check' })).toContainText('Complete the security check');
  expect(sends).toHaveLength(0);
  await page.getByRole('button', { name: 'Complete fixture security check' }).click();
  await page.locator('form').getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Verify your email' })).toBeVisible();
  expect(sends).toHaveLength(1);
  expect(sends[0].gotrue_meta_security).toMatchObject({ captcha_token: expect.stringContaining('fixture-proof-') });
  await page.clock.fastForward(61_000);
  await page.getByRole('button', { name: 'Resend code', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Complete the security check' })).toContainText('Complete the security check');
  expect(sends).toHaveLength(1);
  await page.getByRole('button', { name: 'Complete fixture security check' }).click();
  await page.getByRole('button', { name: 'Resend code', exact: true }).click();
  await expect.poll(() => sends.length).toBe(2);
  expect(sends[1].gotrue_meta_security).toMatchObject({ captcha_token: expect.stringContaining('fixture-proof-') });
  expect(sends[1].gotrue_meta_security).not.toEqual(sends[0].gotrue_meta_security);
});

test('unconfirmed password sign-in offers verification recovery and invalidates expired proof', async ({ page }) => {
  await fixtures(page);
  let attempts = 0;
  await page.route('**/auth/v1/token*', async (route) => {
    attempts += 1;
    await route.fulfill({ status: 400, json: { code: 'email_not_confirmed', error_code: 'email_not_confirmed', message: 'Email not confirmed' } });
  });
  await page.goto('/login');
  await page.getByPlaceholder('Email address').fill('fixture@example.com');
  await page.getByPlaceholder('Password', { exact: true }).fill('FixturePassword1');
  await page.getByRole('button', { name: 'Complete fixture security check' }).click();
  await page.evaluate(() => {
    const callbacks = (window as unknown as { __challengeCallbacks: Record<string, Record<string, () => void>> }).__challengeCallbacks;
    Object.values(callbacks).forEach((entry) => entry['expired-callback']());
  });
  await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
  expect(attempts).toBe(0);
  await page.getByRole('button', { name: 'Complete fixture security check' }).click();
  await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Verify your email' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resend code', exact: true })).toBeEnabled();
  expect(attempts).toBe(1);
});

test('outlet invitation registration reuses password rules and keeps its confirmation return', async ({ page }) => {
  await fixtures(page);
  const token = 'fixture-outlet-invitation';
  await page.route('**/api/outlet-manager-invitations/*', (route) => route.fulfill({ json: { data: {
    email: 'fixture@example.com', status: 'pending', expiresAt: '2099-01-01T00:00:00Z',
    vendorName: 'Fixture vendor', outletName: 'Fixture outlet', city: null, state: null,
  }, error: null } }));
  let sent = false;
  await page.route('**/auth/v1/signup*', async (route) => {
    const body = route.request().postDataJSON();
    expect(body.gotrue_meta_security.captcha_token).toContain('fixture-proof-');
    expect(new URL(route.request().url()).searchParams.get('redirect_to')).toContain('/auth/callback?next=%2Foutlet-manager-invitations%2F' + token);
    sent = true;
    await route.fulfill({ json: { user: { id: 'fixture-user', email: 'fixture@example.com', identities: [] }, session: null } });
  });
  await page.goto('/outlet-manager-invitations/' + token);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByLabel('Full name').fill('Fixture manager');
  await page.getByLabel('Password', { exact: true }).fill('weak');
  await page.getByRole('button', { name: 'Complete fixture security check' }).click();
  await page.locator('form button[type="submit"]').click();
  expect(sent).toBe(false);
  await page.getByLabel('Password', { exact: true }).fill('FixturePassword1');
  await page.locator('form button[type="submit"]').click();
  await expect.poll(() => sent).toBe(true);
});

test('password recovery forwards proof without sending real recovery mail', async ({ page }) => {
  await fixtures(page);
  let proof = '';
  await page.route('**/auth/v1/recover*', async (route) => {
    proof = route.request().postDataJSON().gotrue_meta_security.captcha_token;
    await route.fulfill({ json: {} });
  });
  await page.goto('/login');
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.getByLabel('Email address').fill('fixture@example.com');
  await page.getByRole('button', { name: 'Complete fixture security check' }).click();
  await page.getByRole('button', { name: 'Send reset instructions' }).click();
  await expect.poll(() => proof).toContain('fixture-proof-');
  await expect(page.getByRole('status').filter({ hasText: 'If an account matches' })).toBeVisible();
});
