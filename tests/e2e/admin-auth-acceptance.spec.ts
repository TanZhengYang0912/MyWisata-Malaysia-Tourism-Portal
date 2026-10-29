import { createHash, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { api, localEnv } from './helpers/demo';
import { installPortalFixtureCleanup, PortalFixture, portalArtifacts } from './helpers/portal-fixture';
import { PortalGallery, portalRoutes } from './helpers/portal-pages';
import { authenticateStaff, staffEvidence } from './helpers/staff-auth';

test.use({ trace: 'off', video: 'off', launchOptions: { channel: 'chrome' } });
test.setTimeout(1_200_000);
installPortalFixtureCleanup();
test('a real password, TOTP and WebAuthn assertion authorize the three admin modules', async ({ page }) => {
  test.skip(localEnv('PORTAL_E2E_INTERACTIVE') !== '1', 'Requires a headed browser and a human-completed CAPTCHA on the authorized test project.');
  const fixture = new PortalFixture();
  const gallery = new PortalGallery('admin', 'real-password+human-captcha+totp+virtual-webauthn; hardware-device acceptance separate');
  const evidence: Record<string, unknown> = { projectRef: fixture.target.projectRef, runId: fixture.runId };
  try {
    const account = await fixture.createAccount('super_admin');
    const vendorOwner = await fixture.createAccount();
    const vendorName = `Portal QA vendor ${fixture.runId.slice(0, 8)}`;
    const vendorId = await fixture.insert('vendors', { owner_id: vendorOwner.id, name: vendorName, slug: `portal-qa-${fixture.runId}`, status: 'pending' });
    const promotionTitle = `Portal QA event ${fixture.runId.slice(0, 8)}`;
    const date = new Date().toISOString().slice(0, 10);
    const promotionId = await fixture.insert('vendor_event_promotions', { vendor_id: vendorId, submitted_by: vendorOwner.id, title: promotionTitle,
      details: 'Synthetic event advertising detail; never approve, publish or pay this fixture.', poster_url: '/customer/melaka-home-destination.webp', starts_on: date, ends_on: date, status: 'pending' });
    const session = await authenticateStaff(page, fixture, account);
    evidence.authentication = session.evidence;
    for (const spec of [
      { routeTemplate: '/admin/access-control', path: '/admin/access-control', role: 'super_admin', heading: 'Access Control', apiPath: '/api/admin/access-control/overview' },
      { routeTemplate: '/admin/event-promotions', path: '/admin/event-promotions', role: 'super_admin', heading: 'External Event Ads', apiPath: '/api/admin/event-promotions', content: promotionTitle },
      { routeTemplate: '/admin/recommendations', path: '/admin/recommendations', role: 'super_admin', heading: 'Recommendation Moderation', apiPath: '/api/admin/recommendations' },
      { routeTemplate: '/admin/event-promotions/[id]', path: `/admin/event-promotions/${promotionId}`, role: 'super_admin', content: promotionTitle, apiPath: `/api/admin/event-promotions/${promotionId}`, fixtureRef: promotionId },
      { routeTemplate: '/admin/help/[slug]', path: '/admin/help/staff-sign-in-security', role: 'super_admin', content: 'Staff sign in security' },
    ]) {
      const result = await gallery.capture(page, spec); expect.soft(result.passed, result.reason ?? spec.path).toBe(true);
    }
    // Static admin pages are visual smoke; domain acceptance is asserted above.
    const covered = new Set(['/admin/access-control', '/admin/event-promotions', '/admin/recommendations']);
    if (localEnv('PORTAL_E2E_SCREENSHOT_ALL') === '1') for (const route of portalRoutes().filter(route => route.startsWith('/admin/') && !route.includes('[') && !covered.has(route) && !['/admin/kyc', '/admin/kyc/mfa', '/admin/security'].includes(route))) {
      const result = await gallery.capture(page, { routeTemplate: route, path: route, role: 'super_admin' });
      expect.soft(result.passed, result.reason ?? route).toBe(true);
    }
    // Invalidate only this run's new staff credentials; the old browser must lose authority.
    const grant = randomBytes(32).toString('base64url');
    const revoked = await fixture.service.rpc('issue_staff_passkey_enrollment_grant', { p_user_id: account.id, p_token_hash: createHash('sha256').update(grant).digest('hex'), p_reason: `Revoke this temporary QA device ${fixture.runId}`, p_recovery: true });
    expect(revoked.error?.code).toBeUndefined();
    evidence.afterCredentialRevocation = await staffEvidence(page, fixture);
    expect(evidence.afterCredentialRevocation).toMatchObject({ verified: false, isSuperAdmin: false, eventReview: false, recommendationReview: false });
    for (const path of ['/api/admin/access-control/overview', '/api/admin/event-promotions', '/api/admin/recommendations']) expect((await api(page, 'GET', path)).status).toBe(403);
    await session.removeVirtualDevice();
  } finally {
    gallery.write();
    // Playwright may have already destroyed the context on interruption. Auth
    // and database cleanup must still run when browser cleanup is unavailable.
    try { if (!page.isClosed()) await page.context().clearCookies(); } finally { await fixture.cleanup(); }
    evidence.cleanup = 'verified';
    writeFileSync(join(portalArtifacts(), 'admin-auth-evidence.json'), JSON.stringify(evidence, null, 2));
  }
});
