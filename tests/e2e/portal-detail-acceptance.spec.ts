import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { api, localEnv } from './helpers/demo';
import { installPortalFixtureCleanup, PortalFixture } from './helpers/portal-fixture';
import { PortalGallery } from './helpers/portal-pages';
import type { Order } from '@/backend/core/types';

test.use({ trace: 'off', video: 'off' });
test.setTimeout(240_000);
installPortalFixtureCleanup();
test('temporary customers can open their own detail and cannot read another customer ticket', async ({ browser, baseURL }) => {
  test.skip(!localEnv('PORTAL_E2E_TEST_DB_CONFIRM'), 'Requires explicit confirmation of the authorized shared test project.');
  const fixture = new PortalFixture();
  const gallery = new PortalGallery('customer-details', 'temporary-customer-magiclink; not staff authentication acceptance');
  const owner = await browser.newContext();
  const other = await browser.newContext();
  try {
    const account = await fixture.createAccount(); const outsider = await fixture.createAccount();
    const title = `Portal QA trip ${fixture.runId.slice(0, 8)}`;
    const ticketTitle = `Portal QA support ${fixture.runId.slice(0, 8)}`;
    const tripId = await fixture.insert('trips', { user_id: account.id, name: title });
    const ticketId = await fixture.insert('support_tickets', { user_id: account.id, subject: ticketTitle, body: 'Synthetic acceptance ticket; no external messages or attachments.', status: 'closed' });
    await fixture.authenticateCustomer(owner, account, baseURL!);
    const page = await owner.newPage();
    for (const spec of [
      { routeTemplate: '/customer/trip/[tripId]', path: `/customer/trip/${tripId}`, role: 'customer', content: 'your days', fixtureRef: tripId },
      { routeTemplate: '/customer/support/[id]', path: `/customer/support/${ticketId}`, role: 'customer', content: ticketTitle, fixtureRef: ticketId, apiPath: `/api/support/tickets/${ticketId}` },
      { routeTemplate: '/customer/profile/[userId]', path: `/customer/profile/${account.id}`, role: 'customer', content: 'Portal QA customer', fixtureRef: account.id },
    ]) {
      const result = await gallery.capture(page, spec); expect.soft(result.passed, result.reason ?? spec.path).toBe(true);
    }
    const { client } = await fixture.browserClient(page);
    const ownedTrip = await client.from('trips').select('id,name,user_id').eq('id', tripId).single();
    expect(ownedTrip.error?.code).toBeUndefined();
    expect(ownedTrip.data).toMatchObject({ id: tripId, name: title, user_id: account.id });
    await fixture.authenticateCustomer(other, outsider, baseURL!);
    const outsiderPage = await other.newPage(); await outsiderPage.goto('/customer');
    const denied = await api(outsiderPage, 'GET', `/api/support/tickets/${ticketId}`);
    expect([403, 404]).toContain(denied.status);
    expect(JSON.stringify(denied.json)).not.toContain(ticketTitle);
    const missing = await api(page, 'GET', `/api/support/tickets/${randomUUID()}`);
    expect(missing.status).toBe(404);
  } finally {
    await owner.close(); await other.close(); gallery.write(); await fixture.cleanup();
  }
});

test('show valid financial detail shapes without writing financial records', async ({ browser, baseURL }) => {
  test.skip(!localEnv('PORTAL_E2E_TEST_DB_CONFIRM'), 'Requires an explicitly confirmed project for the temporary customer identity only.');
  const fixture = new PortalFixture();
  const context = await browser.newContext();
  const gallery = new PortalGallery('financial-ui', 'mock financial responses; real temporary customer; no live finance acceptance');
  try {
    const account = await fixture.createAccount();
    await fixture.authenticateCustomer(context, account, baseURL!);
    const page = await context.newPage();
    const orderId = randomUUID(), bookingId = randomUUID(), sessionId = randomUUID(), productId = randomUUID(), outletId = randomUUID();
    const title = 'Portal QA booking detail';
    const order: Order = { id: orderId, displayId: 'ORD-QA-DETAIL', userId: account.id, items: [{ activityId: productId, activityName: title, variantLabel: 'Test admission', qty: 1, unitPrice: 0, outletId, slotStartsAt: '2026-11-01T02:00:00Z' }], subtotal: 0, discount: 0, total: 0, status: 'CANCELLED', createdAt: '2026-10-26T00:00:00Z', paymentMethod: 'free_reservation' };
    const booking = { id: bookingId, status: 'cancelled', order_items: { order_id: orderId, product_id: productId, product_name: title, outlet_id: outletId, slot_starts_at: '2026-11-01T02:00:00Z', nights: 1, quantity: 1, products: { categories: { slug: 'activity' } } }, ticket_passes: [] };
    let financialMutations = 0;
    await page.route('**/api/payments/simulator/sessions/*/action', route => { financialMutations += 1; return route.abort(); });
    await page.route('**/api/orders/*/refund', route => { financialMutations += 1; return route.abort(); });
    await page.route(`**/api/customer/orders/${orderId}`, route => route.fulfill({ json: { data: { order, bookings: [] }, error: null } }));
    await page.route(`**/api/payments/simulator/sessions/${sessionId}`, route => route.fulfill({ json: { data: { sessionId, orderId, provider: 'bank_transfer_simulator', providerPaymentId: 'QA-NO-FUNDS', amountSen: 0, currency: 'MYR', status: 'cancelled', expiresAt: '2026-11-01T00:00:00Z', simulated: true }, error: null } }));
    await page.route('**/rest/v1/bookings?**', route => route.fulfill({ json: new URL(route.request().url()).searchParams.has('id') ? booking : [booking] }));
    for (const spec of [
      { routeTemplate: '/customer/orders/[id]', path: `/customer/orders/${orderId}`, role: 'customer', content: title, apiPath: `/api/customer/orders/${orderId}` },
      { routeTemplate: '/customer/bookings/[id]', path: `/customer/bookings/${bookingId}`, role: 'customer', content: title },
      { routeTemplate: '/customer/checkout/simulator/[sessionId]', path: `/customer/checkout/simulator/${sessionId}`, role: 'customer', apiPath: `/api/payments/simulator/sessions/${sessionId}` },
    ]) { const result = await gallery.capture(page, { ...spec, environment: 'mock' }); expect.soft(result.passed, result.reason ?? spec.path).toBe(true); }
    expect(financialMutations).toBe(0);
  } finally { await context.close(); gallery.write(); await fixture.cleanup(); }
});
