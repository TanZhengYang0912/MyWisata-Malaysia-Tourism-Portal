import { createHash, randomBytes } from 'node:crypto';
import { expect, type Locator, type Page } from '@playwright/test';
import { totpCode } from './demo';
import { PortalFixture, type PortalAccount } from './portal-fixture';

export type StaffEvidence = { aal: string; methods: string[]; passwordAuthenticated: boolean; verified: boolean; isSuperAdmin: boolean; eventReview: boolean; recommendationReview: boolean };

export async function staffEvidence(page: Page, fixture: PortalFixture): Promise<StaffEvidence> {
  const { client, sync } = await fixture.browserClient(page);
  const claims = await client.auth.getClaims();
  expect(claims.error, 'Verify the session signature before inspecting authentication methods').toBeNull();
  const [status, admin, events, recommendations] = await Promise.all([
    client.rpc('staff_passkey_status'), client.rpc('is_super_admin', { uid: claims.data!.claims.sub }),
    client.rpc('has_staff_permission', { p_user_id: claims.data!.claims.sub, p_permission_key: 'admin.event_promotion.review' }),
    client.rpc('has_staff_permission', { p_user_id: claims.data!.claims.sub, p_permission_key: 'admin.recommendation.review' }),
  ]);
  for (const result of [status, admin, events, recommendations]) expect(result.error?.code, 'Staff RPC must be deployed and callable').toBeUndefined();
  await sync();
  const methods: Array<string | { method: string }> = claims.data!.claims.amr ?? [];
  return { aal: String(claims.data!.claims.aal), methods: methods.map(entry => typeof entry === 'string' ? entry : entry.method),
    passwordAuthenticated: status.data?.passwordAuthenticated === true, verified: status.data?.verified === true,
    isSuperAdmin: admin.data === true, eventReview: events.data === true, recommendationReview: recommendations.data === true };
}

/** Prevent a failed locator's call log from printing passwords, OTPs or grants. */
async function fillPrivate(input: Locator, value: string) {
  try { await input.fill(value); } catch { throw new Error('Unable to fill the temporary account security field'); }
}

/** CAPTCHA is explicitly excluded only in the authorized, bounded local test runner. */
export async function passwordLogin(page: Page, account: PortalAccount) {
  const captchaWindow = process.env.PORTAL_E2E_CAPTCHA_WINDOW;
  if (captchaWindow) {
    expect(process.env.PORTAL_E2E_BASE_URL).toBe('http://localhost:3001');
    expect(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY).toBe('1x00000000000000000000AA');
    // This fixture replaces only the disabled provider UI. Supabase password
    // authentication and all later MFA/RBAC requests are real and unintercepted.
    await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js*', route => route.fulfill({
      contentType: 'application/javascript', body: `window.turnstile={render:(element,options)=>{
        if(options.sitekey!=='1x00000000000000000000AA')throw new Error('Unexpected test key');
        queueMicrotask(()=>{options.callback('XXXX.DUMMY.TOKEN.XXXX');element.dataset.portalQaCaptcha='ready';element.textContent='CAPTCHA excluded for this authorized acceptance run';});return 'portal-qa';
      },remove:()=>{}};`,
    }));
  }
  await page.goto('/login');
  await page.waitForFunction(() => Boolean(window.turnstile), undefined, { timeout: 45_000 });
  await page.locator('input[type="email"]').fill(account.email);
  await fillPrivate(page.locator('input[type="password"]'), account.password);
  await expect(page.locator('input[type="email"]')).toHaveValue(account.email);
  expect(await page.locator('input[type="password"]').inputValue() === account.password).toBe(true);
  if (captchaWindow) {
    expect(new URL(page.url()).origin).toBe('http://localhost:3001');
    expect(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY).toBe('1x00000000000000000000AA');
    await expect(page.locator('[data-portal-qa-captcha="ready"]')).toBeVisible();
    await page.locator('form').getByRole('button', { name: /^sign in$/i }).click();
    await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 45_000 });
    return;
  }
  console.log('PORTAL_QA_HUMAN_CHECKPOINT: Complete the security check and click Sign in in the headed temporary-account browser.');
  await expect.poll(async () => {
    if (!new URL(page.url()).pathname.startsWith('/login')) return true;
    // Human refreshes and development reloads must not leave an empty form.
    // Never click a demo account or complete the provider challenge here.
    const email = page.locator('input[type="email"]');
    const password = page.locator('input[type="password"]');
    if (await email.isVisible() && await password.isVisible()) {
      if (!await email.inputValue()) await email.fill(account.email);
      if (!await password.inputValue()) await fillPrivate(password, account.password);
    }
    return false;
  }, { timeout: 600_000, intervals: [1000], message: 'Wait for human CAPTCHA and temporary-account password login' }).toBe(true);
}

export async function authenticateStaff(page: Page, fixture: PortalFixture, account: PortalAccount, existingPasswordSession = false) {
  expect(['super_admin', 'approver', 'staff']).toContain(account.role);
  const destination = account.role === 'super_admin' ? '/admin/dashboard' : account.role === 'approver' ? '/admin/withdrawals' : '/staff';
  if (!existingPasswordSession) await passwordLogin(page, account);
  const { client, sync } = await fixture.browserClient(page);
  const identity = await client.auth.getUser();
  expect(identity.error, 'Verify the signed-in identity before enrolling any factor').toBeNull();
  expect(identity.data.user?.id, 'MFA changes must belong only to this run-created identity').toBe(account.id);
  const before = await staffEvidence(page, fixture);
  expect(before.methods).toContain('password');
  expect(before.methods.some(method => ['magiclink', 'otp', 'recovery'].includes(method))).toBe(false);
  expect(before.verified).toBe(false);
  expect(before.isSuperAdmin).toBe(false);

  // Enroll a disposable factor with the user's real password session. Never print its secret.
  const factor = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Portal QA temporary', issuer: 'MYLawatan' });
  expect(factor.error, 'Enroll only the new temporary staff factor').toBeNull();
  if (!factor.data || factor.data.type !== 'totp') throw new Error('Expected a temporary TOTP enrollment.');
  const secret = factor.data.totp.secret;
  const setupCode = totpCode(secret);
  const setup = await client.auth.mfa.challengeAndVerify({ factorId: factor.data.id, code: setupCode });
  expect(setup.error, 'Verify the temporary factor').toBeNull();
  await sync();

  // Exercise the actual TOTP form after enrollment, with a fresh code rather than a replay.
  await expect.poll(() => totpCode(secret), { timeout: 35_000, intervals: [1000] }).not.toBe(setupCode);
  await page.goto(`/auth/staff-mfa?next=${encodeURIComponent(destination)}`);
  await page.getByRole('button', { name: /set up or verify authenticator/i }).click();
  await fillPrivate(page.locator('#kyc-mfa-code'), totpCode(secret));
  await page.getByRole('button', { name: /verify and continue/i }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/auth/staff-mfa'), { timeout: 45_000 });
  const totp = await staffEvidence(page, fixture);
  expect(totp.aal).toBe('aal2');
  expect(totp.methods).toContain('password');
  expect(totp.methods).toContain('totp');
  expect(totp.passwordAuthenticated).toBe(true);
  expect(totp.verified).toBe(false);
  expect(totp.isSuperAdmin).toBe(false);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: {
    protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true,
    isUserVerified: true, automaticPresenceSimulation: true,
  } });
  const grant = randomBytes(32).toString('base64url');
  const enrollment = await fixture.service.rpc('issue_staff_passkey_enrollment_grant', {
    p_user_id: account.id, p_token_hash: createHash('sha256').update(grant).digest('hex'),
    p_reason: `Temporary portal QA enrollment ${fixture.runId}`, p_recovery: false,
  });
  expect(enrollment.error?.code, 'Issue a one-use grant only for this temporary identity').toBeUndefined();
  await page.goto(`/auth/staff-verification?next=${encodeURIComponent(destination)}`);
  await fillPrivate(page.locator('#staff-passkey-grant'), grant);
  await page.locator('#staff-passkey-label').fill('Temporary QA virtual device');
  await page.getByRole('button', { name: 'Register a device', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Device registered');
  expect((await staffEvidence(page, fixture)).verified, 'Registration alone must not authorize staff').toBe(false);
  await page.getByRole('button', { name: 'Verify Passkey', exact: true }).click();
  await page.waitForURL(url => url.pathname === destination, { timeout: 45_000 });
  const full = await staffEvidence(page, fixture);
  const superAdmin = account.role === 'super_admin';
  expect(full).toMatchObject({ aal: 'aal2', passwordAuthenticated: true, verified: true, isSuperAdmin: superAdmin,
    eventReview: superAdmin || account.role === 'approver', recommendationReview: superAdmin });
  await page.reload();
  expect(await staffEvidence(page, fixture)).toMatchObject(full);
  return { evidence: { password: before, totp, full }, removeVirtualDevice: () => cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId }) };
}
