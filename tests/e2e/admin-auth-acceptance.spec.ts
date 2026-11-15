import { createHash, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { api, localEnv } from './helpers/demo';
import { installPortalFixtureCleanup, PortalFixture, portalArtifacts } from './helpers/portal-fixture';
import { adminRoutesAvailableToNavigation, PortalGallery, portalRoutes } from './helpers/portal-pages';
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

    // Exercise the shortage reason chooser with a synthetic order and never submit its preview.
    let shortageRequests = 0;
    await page.route('**/api/admin/orders?*', route => route.fulfill({ json: { data: {
      orders: [{
        id: '00000000-0000-4000-8000-000000000001', isGuest: false, canCorrectGuestContact: false,
        display_id: 'ORD-QA-SHORTAGE', status: 'paid', subtotal: 45, discount_amount: 0, total_amount: 45,
        currency: 'MYR', payment_method: 'stripe_card', voucher_code: null, paid_at: new Date().toISOString(),
        created_at: new Date().toISOString(), customer: { name: 'Synthetic QA customer', email: null },
        items: [{ id: '00000000-0000-4000-8000-000000000002', eventListingId: '00000000-0000-4000-8000-000000000003',
          pickupDate: '2026-11-20', productName: 'Synthetic event item', quantity: 1, lineTotal: 45, fulfilStatus: 'pending',
          vendorName: 'Synthetic vendor', outletName: null }], itemCount: 1, itemsHasMore: false, paymentCount: 1,
        paymentsHasMore: false, payments: [], payment: null,
      }], page: 1, pageSize: 25, total: 1, canCorrectGuestContact: false,
    }, error: null } }));
    await page.route('**/api/admin/orders/event-shortage', async route => {
      shortageRequests += 1;
      await route.fulfill({ json: { data: {}, error: null } });
    });
    await page.goto('/admin/orders');
    await page.getByRole('button', { name: 'Resolve shortage for this date' }).first().click();
    const reasonSelector = page.getByRole('combobox', { name: 'Shortage reason' });
    await expect(reasonSelector).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Explain the reason' })).toHaveCount(0);
    await reasonSelector.click();
    await page.getByRole('option', { name: 'Supplier confirmed stock is unavailable' }).click();
    await expect(page.getByRole('textbox', { name: 'Explain the reason' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();

    await page.getByRole('button', { name: 'Resolve shortage for this date' }).first().click();
    await page.getByRole('combobox', { name: 'Shortage reason' }).click();
    await page.getByRole('option', { name: 'Other', exact: true }).click();
    const manualReason = page.getByRole('textbox', { name: 'Explain the reason' });
    await expect(manualReason).toBeVisible();
    await manualReason.fill('Unexpected delivery interruption');
    await expect(page.getByRole('button', { name: 'Preview impact' })).toBeEnabled();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(shortageRequests, 'Choosing or canceling a reason must not preview or mutate a shortage').toBe(0);
    await page.unroute('**/api/admin/orders?*');
    await page.unroute('**/api/admin/orders/event-shortage');

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
    if (localEnv('PORTAL_E2E_SCREENSHOT_ALL') === '1') {
      const navigationHrefs = await page.locator('nav a[href^="/admin/"]').evaluateAll(links => links.map(link => new URL((link as HTMLAnchorElement).href).pathname));
      const routes = portalRoutes().filter(route => route.startsWith('/admin/') && !route.includes('[') && !covered.has(route));
      const reachableRoutes = adminRoutesAvailableToNavigation(routes, navigationHrefs);
      const sensitiveRoutes = new Set(['/admin/kyc', '/admin/kyc/mfa', '/admin/security']);
      expect(reachableRoutes).toContain('/admin/catalogue/hotel-amenities');
      expect(reachableRoutes).toContain('/admin/staff-conduct');
      expect(reachableRoutes).toContain('/admin/notifications');
      expect(reachableRoutes).not.toContain('/admin/hotel-amenities');
      expect(reachableRoutes).not.toContain('/admin/rewards');
      expect(reachableRoutes).toContain('/admin/recommendations/rewards');

      for (const route of reachableRoutes.filter(path => !sensitiveRoutes.has(path))) {
        const spec = route === '/admin/staff-conduct'
          ? { routeTemplate: route, path: route, role: 'super_admin', apiPath: '/api/admin/conduct-queue' }
          : route === '/admin/catalogue/hotel-amenities'
            ? { routeTemplate: route, path: route, role: 'super_admin', apiPath: '/api/admin/hotel-amenities' }
            : { routeTemplate: route, path: route, role: 'super_admin' };
        const result = await gallery.capture(page, spec);
        expect.soft(result.passed, result.reason ?? route).toBe(true);
      }
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
