import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { localEnv } from './helpers/demo';
import { installPortalFixtureCleanup, PortalFixture, portalArtifacts } from './helpers/portal-fixture';
import { PortalGallery, portalRoutes, type PortalPage } from './helpers/portal-pages';

test.use({ trace: 'off', video: 'off' });
test.setTimeout(900_000);
installPortalFixtureCleanup();
test('capture public and temporary-customer pages after loading boundaries settle', async ({ browser, baseURL }) => {
  test.skip(!localEnv('PORTAL_E2E_TEST_DB_CONFIRM'), 'Requires explicit confirmation of the authorized shared test project.');
  const fixture = new PortalFixture();
  const context = await browser.newContext();
  const publicContext = await browser.newContext();
  const gallery = new PortalGallery('customer-public', 'public or run-owned customer; private financial positive cases require an isolated runtime');
  const routes = portalRoutes();
  const tested: string[] = [];
  try {
    const customer = await fixture.createAccount();
    await fixture.authenticateCustomer(context, customer, baseURL!);
    const page = await context.newPage();
    const publicPage = await publicContext.newPage();
    const cases: PortalPage[] = routes.filter(route => (route === '/customer' || route.startsWith('/customer/')) && !route.includes('[')).map(path => ({ routeTemplate: path, path, role: 'customer' }));
    const product = await fixture.service.from('products').select('id,name,vendor_id,outlet_id,vendors!inner(status),categories!inner(slug)').eq('status', 'active').eq('vendors.status', 'approved').neq('categories.slug', 'accommodation').not('outlet_id', 'is', null).order('id').limit(1).single();
    expect(product.error?.code).toBeUndefined();
    expect(product.data?.id, 'Discover a real active product rather than inventing an ID').toBeTruthy();
    const row = product.data!;
    cases.push(
      { routeTemplate: '/customer/activity/[id]', path: `/customer/activity/${row.id}`, role: 'customer', fixtureRef: row.id, content: row.name },
      { routeTemplate: '/customer/experience/[experienceId]', path: `/customer/experience/${row.id}`, role: 'customer', fixtureRef: row.id, content: row.name },
      { routeTemplate: '/customer/vendor/[vendorId]', path: `/customer/vendor/${row.vendor_id}`, role: 'customer', fixtureRef: row.vendor_id },
      { routeTemplate: '/customer/outlet/[outletId]', path: `/customer/outlet/${row.outlet_id}`, role: 'customer', fixtureRef: row.outlet_id },
      { routeTemplate: '/customer/vendor/[vendorId]/outlet/[outletId]', path: `/customer/vendor/${row.vendor_id}/outlet/${row.outlet_id}`, role: 'customer', fixtureRef: row.outlet_id },
    );
    for (const spec of cases) {
      const result = await gallery.capture(page, spec); tested.push(spec.routeTemplate);
      expect.soft(result.passed, result.reason ?? spec.path).toBe(true);
    }
    for (const path of ['/login', '/help', '/legal/about', '/legal/data', '/legal/privacy', '/legal/terms']) {
      const result = await gallery.capture(publicPage, { routeTemplate: path, path, role: 'public' }); tested.push(path);
      expect.soft(result.passed, result.reason ?? path).toBe(true);
    }
    // Discover event/place links from the real UI, preserving parent-child relationships.
    await page.goto('/customer/events');
    await expect(page.getByRole('heading', { name: 'Pop-up events & offers', exact: true })).toBeVisible({ timeout: 25_000 });
    const eventLinks = await page.locator('a[href^="/customer/events/"]').evaluateAll(links => links.map(link => link.getAttribute('href')).filter((href): href is string => Boolean(href)));
    const eventPath = eventLinks.find(path => path.split('/').length === 4);
    if (eventPath) {
      const result = await gallery.capture(page, { routeTemplate: '/customer/events/[slug]', path: eventPath, role: 'customer' }); tested.push('/customer/events/[slug]'); expect.soft(result.passed, result.reason ?? eventPath).toBe(true);
      const vendorPath = await page.locator('a[href^="/customer/events/"]').evaluateAll(links => links.map(link => link.getAttribute('href')).find(href => href?.split('/').length === 5));
      if (vendorPath) { const result = await gallery.capture(page, { routeTemplate: '/customer/events/[slug]/[vendorId]', path: vendorPath, role: 'customer' }); tested.push('/customer/events/[slug]/[vendorId]'); expect.soft(result.passed, result.reason ?? vendorPath).toBe(true); }
    }
    await page.goto('/customer/explore');
    const placeLink = page.locator('a[href^="/customer/place/"]').first();
    if (await placeLink.count()) {
      const placePath = await placeLink.getAttribute('href');
      if (placePath) { const result = await gallery.capture(page, { routeTemplate: '/customer/place/[slug]', path: placePath, role: 'customer' }); tested.push('/customer/place/[slug]'); expect.soft(result.passed, result.reason ?? placePath).toBe(true); }
    }
  } finally {
    await context.close(); await publicContext.close(); gallery.write(); await fixture.cleanup();
    writeFileSync(join(portalArtifacts(), 'route-coverage.json'), JSON.stringify({ routes, tested, otherEvidence: ['admin-manifest.json', 'customer-details-manifest.json'],
      notAssertedByThisSpec: routes.filter(route => !tested.includes(route)), limitations: ['Protected vendor/staff pages need their own role fixtures.', 'Financial positive details need an isolated Supabase runtime; this run does not change financial records.', 'KYC document/withdrawal decisions are outside the approved scope.'] }, null, 2));
  }
});
