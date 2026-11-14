import { expect, test, type Browser, type Page } from '@playwright/test';
import { ACCOUNTS, api, contextFor, shot } from './helpers/demo';

// Event lifecycle on the seeded "Heritage Walk KL" event: the vendor's stall
// setup, reservation rules, a paid reservation, the per-item event fee charged
// at settlement, and the pickup scan rules. Runs serially; each step builds on
// the previous one. Payments use the demo simulator (is_live=false), so no
// real money moves, but the orders are real rows in the demo database.
test.describe.configure({ mode: 'serial', timeout: 300_000 });

const EVENT_SLUG = 'heritage-walk-kl-current-offers';
const CAMPAIGN_ID = '51cc729b-1182-4200-856e-0bce82590f44';
const STALL_VENDOR_ID = '1aa86fbf-d6af-9dfa-08f0-8ab112bcea3f'; // Hameediyah Restaurant, stall A12
const OTHER_VENDOR_ID = 'c767a45b-79ad-2079-2ca5-d140af71e239'; // Abdul Antiques, stall A31
const STALL_URL = `/customer/events/${EVENT_SLUG}/${STALL_VENDOR_ID}`;
const ITEM = 'Kari Kambing'; // RM14.00
const ITEM_PRICE_SEN = 1400;
const LISTING_ID = '74f41880-4572-4e5a-8a3b-6cd09900f390';
const OPEN_SLOT = { id: 'b4e7bf0d-d079-46f3-a421-66f2403b7666', text: '10:00 AM – 9:30 PM' }; // already started today
const LATE_SLOT_TEXT = '9:45 PM – 10:00 PM'; // starts later today
const EVENT_FEE_PER_ITEM_SEN = 50; // RM0.50 per item ordered from this event
const FEE_REASON = 'E2E: set event fee to verify per-item charging';

const state: { orderId?: string; eventToken?: string } = {};

/** Malaysia calendar date and minutes since midnight, whatever the test machine's timezone. */
function malaysiaNow() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

const scanValue = (orderId: string, token: string) => `/customer/orders/${orderId}?event_t=${token}`;
const errorCode = (r: { json: unknown }) => (r.json as { error?: { code?: string } } | null)?.error?.code;

async function openStall(page: Page) {
  await page.goto(`/vendor/events/${CAMPAIGN_ID}`, { waitUntil: 'domcontentloaded' });
  const mainLocation = page.getByRole('region', { name: 'Locations' }).getByText('Main location', { exact: true });
  await expect(mainLocation).toBeVisible({ timeout: 60_000 });
  const selectMainLocation = page.getByRole('button', { name: 'Main location', exact: true });
  if (await selectMainLocation.isVisible()) await selectMainLocation.click();
  await expect(page.getByText('Pickup times').first()).toBeVisible({ timeout: 60_000 });
}

async function setEventFee(page: Page, sen: number | null) {
  await page.goto('/admin/vendors/platform-fees', { waitUntil: 'domcontentloaded' });
  const input = page.getByLabel(/Fee per item for Heritage Walk KL/);
  await expect(input).toBeVisible({ timeout: 90_000 });
  await input.fill(sen === null ? '' : String(sen / 100));
  await page.getByLabel('Reason for this change').fill(FEE_REASON);
  const saved = page.waitForResponse((r) => r.url().includes('/api/admin/vendor-fee-tiers') && r.request().method() === 'PUT');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await page.getByRole('button', { name: 'Save settings' }).last().click();
  const response = await saved;
  expect(response.status(), await response.text()).toBe(200);
}

/** Reserves ITEM in the given pickup window through the real dialog and pays with the demo simulator. */
async function reserveAndPay(browser: Browser, slotText: string, quantity: number, shotName: string) {
  const customer = await contextFor(browser, ACCOUNTS.customer);
  const page = customer.page;
  await page.goto(STALL_URL, { waitUntil: 'domcontentloaded' });
  await page.locator('li, div').filter({ hasText: ITEM }).getByRole('button', { name: /reserve/i }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 90_000 });
  await dialog.getByText(slotText).click();
  await dialog.getByRole('spinbutton').fill(String(quantity));
  await dialog.getByRole('combobox').selectOption({ label: 'Bank transfer — Demo simulator' });
  const total = `RM${((quantity * ITEM_PRICE_SEN) / 100).toFixed(2)}`;
  const pay = dialog.getByRole('button', { name: new RegExp(`^Pay ${total.replace('.', '\\.')}$`) });
  await expect(pay).toBeVisible();
  await shot(page, `${shotName}_filled`);

  const reserved = page.waitForResponse((r) => r.url().includes('/api/customer/event-reservations') && r.request().method() === 'POST');
  await pay.click();
  const response = await reserved;
  expect(response.status(), await response.text()).toBe(200);
  const data = (await response.json() as { data: { order_id: string; total: number; status: string } }).data;
  expect(data.total).toBe((quantity * ITEM_PRICE_SEN) / 100);
  expect(data.status).toBe('pending_payment');

  await page.waitForURL(/\/customer\/checkout\/simulator\//, { timeout: 90_000 });
  await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 90_000 });
  await page.getByRole('button', { name: 'Mark funds received' }).click();
  await expect.poll(async () => {
    const order = await api(page, 'GET', `/api/customer/orders/${data.order_id}`);
    return JSON.stringify(order.json).match(/"status":"(\w+)"/)?.[1];
  }, { timeout: 60_000, message: 'order becomes paid after the simulated funds arrive' }).toMatch(/paid|completed/i);
  await shot(page, `${shotName}_paid`);

  const passes = await api(page, 'GET', `/api/customer/orders/${data.order_id}/qr-passes`);
  expect(passes.status).toBe(200);
  const pickups = (passes.json as { data: { eventPickups: Array<{ eventToken: string; status: string; items: Array<{ name: string; quantity: number }>; pickupLabels: string[] }> } }).data.eventPickups;
  expect(pickups).toHaveLength(1);
  await customer.context.close();
  return { orderId: data.order_id, pickup: pickups[0] };
}

test('vendor sets quantity per day and pickup times for the stall', async ({ browser }) => {
  const vendor = await contextFor(browser, ACCOUNTS.eventVendorB);
  const page = vendor.page;
  await openStall(page);
  await shot(page, 'ev1_stall_before');

  // Type a different value first so the step still enables Save when 20 is already stored.
  const row = page.locator('li').filter({ hasText: `${ITEM} — RM14.00` });
  await row.getByRole('spinbutton').fill('19');
  await row.getByRole('spinbutton').fill('20');
  const saved = page.waitForResponse((r) => r.url().includes('/campaign-listings/') && r.request().method() === 'PATCH');
  await row.getByRole('button', { name: 'Save' }).click();
  expect((await saved).status()).toBe(200);

  const addSlot = async (from: string, to: string, max: string) => {
    await page.getByLabel('From', { exact: true }).fill(from);
    await page.getByLabel('To', { exact: true }).fill(to);
    await page.getByLabel('Max items', { exact: true }).fill(max);
    const added = page.waitForResponse((r) => r.url().includes('/pickup-slots') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Add time' }).click();
    const status = (await added).status();
    // 200/201 on first run; 409 DUPLICATE when an earlier run already added this window.
    expect([200, 201, 409]).toContain(status);
    await page.waitForTimeout(1500);
  };
  // Inside the event's 10:00-22:00 hours: one window that has started, one later today.
  await addSlot('10:00', '21:30', '10');
  await addSlot('21:45', '22:00', '10');
  await shot(page, 'ev2_stall_after');
  expect(await page.locator('main').innerText()).not.toContain('Add at least one pickup time');
  await vendor.context.close();
});

test('vendor cannot save a backwards pickup window or one outside the event hours', async ({ browser }) => {
  const vendor = await contextFor(browser, ACCOUNTS.eventVendorB);
  const { page } = vendor;
  await openStall(page);

  const attempt = async (from: string, to: string) => {
    await page.getByLabel('From', { exact: true }).fill(from);
    await page.getByLabel('To', { exact: true }).fill(to);
    const posted = page.waitForResponse((r) => r.url().includes('/pickup-slots') && r.request().method() === 'POST', { timeout: 5_000 }).catch(() => null);
    await page.getByRole('button', { name: 'Add time' }).click();
    return posted;
  };
  // Backwards window: rejected in the form, never reaches the server.
  expect(await attempt('15:00', '14:00')).toBeNull();
  // Before opening time: the browser or the server refuses it; either way it is not saved.
  const early = await attempt('06:00', '07:00');
  if (early) expect(early.status()).toBeGreaterThanOrEqual(400);
  expect(await page.locator('main').innerText()).not.toContain('6:00 AM');
  await vendor.context.close();
});

test('admin sets a RM0.50-per-item fee on the event', async ({ browser }) => {
  const admin = await contextFor(browser, ACCOUNTS.admin);
  const before = await api(admin.page, 'GET', '/api/admin/vendor-fee-tiers');
  expect(before.status).toBe(200);
  const read = (json: unknown) => (json as { data: { campaigns: Array<{ id: string; perItemSen: number | null }> } }).data.campaigns.find((c) => c.id === CAMPAIGN_ID);
  expect(read(before.json), 'Heritage Walk campaign is listed on the fee page').toBeTruthy();

  await setEventFee(admin.page, EVENT_FEE_PER_ITEM_SEN);
  await shot(admin.page, 'ev3_admin_event_fee_saved');
  const after = await api(admin.page, 'GET', '/api/admin/vendor-fee-tiers');
  expect(read(after.json)?.perItemSen).toBe(EVENT_FEE_PER_ITEM_SEN);
  await admin.context.close();
});

test('reservation rules reject bad dates, bad slots, too many items and signed-out users', async ({ browser, request }) => {
  const customer = await contextFor(browser, ACCOUNTS.customer);
  const { page } = customer;
  await page.goto(STALL_URL, { waitUntil: 'domcontentloaded' });
  const reserve = (over: Record<string, unknown>) => api(page, 'POST', '/api/customer/event-reservations', {
    listingId: LISTING_ID, pickupDate: malaysiaNow().date, slotId: OPEN_SLOT.id, quantity: 1,
    paymentMethod: 'bank_transfer', paymentProvider: 'bank_transfer_simulator', idempotencyKey: crypto.randomUUID(), ...over,
  });

  const badDate = await reserve({ pickupDate: '2020-01-01' });
  expect([badDate.status, errorCode(badDate)]).toEqual([409, 'EVENT_DATE_INVALID']);

  const badSlot = await reserve({ slotId: crypto.randomUUID() });
  expect([badSlot.status, errorCode(badSlot)]).toEqual([409, 'EVENT_SLOT_INVALID']);

  // The window holds 10 items; asking for 11 in one go can never fit.
  const tooMany = await reserve({ quantity: 11 });
  expect(tooMany.status).toBe(409);
  expect(['EVENT_SLOT_FULL', 'EVENT_SOLD_OUT']).toContain(errorCode(tooMany));

  const zero = await reserve({ quantity: 0 });
  expect(zero.status).toBeGreaterThanOrEqual(400);
  expect(zero.status).toBeLessThan(500);

  // A signed-out request is not an account checkout: it needs a guest session and contact email.
  const anonymous = await request.post('/api/customer/event-reservations', { data: { listingId: LISTING_ID, pickupDate: malaysiaNow().date, slotId: OPEN_SLOT.id, quantity: 1, paymentMethod: 'bank_transfer', paymentProvider: 'bank_transfer_simulator', idempotencyKey: crypto.randomUUID() } });
  expect([401, 403, 422]).toContain(anonymous.status());
  await customer.context.close();
});

test('customer reserves 2 items, pays with the simulator and gets a slot-bound pickup code', async ({ browser }) => {
  const { orderId, pickup } = await reserveAndPay(browser, OPEN_SLOT.text, 2, 'ev5_order');
  state.orderId = orderId;
  state.eventToken = pickup.eventToken;

  expect(pickup.status).toBe('pending');
  expect(pickup.items).toEqual([{ name: ITEM, quantity: 2 }]);
  expect(pickup.pickupLabels[0]).toContain('10:00–21:30');
  // The signed payload names the booked slot (new codes are slot-bound).
  const claims = JSON.parse(Buffer.from(pickup.eventToken.split('.')[1], 'base64url').toString('utf8')) as { pickupSlotId?: string; vendorId: string; orderId: string };
  expect(claims.pickupSlotId).toBe(OPEN_SLOT.id);
  expect(claims.vendorId).toBe(STALL_VENDOR_ID);
  expect(claims.orderId).toBe(orderId);
});

test('platform charges the event fee per item, not the vendor tier percentage', async ({ browser }) => {
  const vendor = await contextFor(browser, ACCOUNTS.eventVendorB);
  const { page } = vendor;
  await page.goto('/vendor/wallet', { waitUntil: 'domcontentloaded' });
  type Settlement = { orderId: string; grossSen: number; platformFeeSen: number; vendorNetSen: number; feeType: string; feeSource: string; feePerItemSen: number | null; itemCount: number | null; isSimulated: boolean };
  let row: Settlement | undefined;
  await expect.poll(async () => {
    const response = await api(page, 'GET', '/api/vendor/settlements');
    row = (response.json as { data: { settlements: Settlement[] } }).data.settlements.find((s) => (state.orderId ? s.orderId === state.orderId : s.feeSource === 'event' && s.itemCount === 2));
    return row !== undefined;
  }, { timeout: 60_000, message: 'a settlement exists for the paid order' }).toBe(true);

  // 2 items x RM0.50 = RM1.00 on a RM28.00 sale (a 15% tier would have taken RM4.20).
  expect(row).toMatchObject({ grossSen: 2800, platformFeeSen: 100, vendorNetSen: 2700, feeType: 'fixed', feeSource: 'event', feePerItemSen: EVENT_FEE_PER_ITEM_SEN, itemCount: 2, isSimulated: true });
  // What the vendor sees: their tier card and the event fee on that order's row.
  await expect(page.getByText('Your platform fee')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText('RM0.50 / item × 2').first()).toBeVisible();
  await expect(page.getByText('Event · RM0.50 / item × 2').first()).toBeVisible();
  await shot(page, 'ev8_vendor_wallet_fee');
  await vendor.context.close();
});

test('pickup scan rules: wrong vendor, tampered code, then a valid scan collects once', async ({ browser }) => {
  expect(state.orderId && state.eventToken, 'previous step created an order').toBeTruthy();
  const orderId = state.orderId as string;
  const token = state.eventToken as string;
  const raw = scanValue(orderId, token);

  // Another event vendor cannot scan this stall's code.
  const other = await contextFor(browser, ACCOUNTS.eventVendorA);
  const wrongVendor = await api(other.page, 'POST', `/api/vendors/${OTHER_VENDOR_ID}/scanner/resolve`, { rawValue: raw });
  expect([wrongVendor.status, errorCode(wrongVendor)]).toEqual([403, 'FORBIDDEN']);
  const wrongVendorFulfil = await api(other.page, 'POST', `/api/vendors/${OTHER_VENDOR_ID}/scanner/fulfil-event-pickup`, { eventToken: token });
  expect([wrongVendorFulfil.status, errorCode(wrongVendorFulfil)]).toEqual([403, 'FORBIDDEN']);
  await other.context.close();

  const vendor = await contextFor(browser, ACCOUNTS.eventVendorB);
  const { page } = vendor;
  const resolve = (value: string) => api(page, 'POST', `/api/vendors/${STALL_VENDOR_ID}/scanner/resolve`, { rawValue: value });
  const fulfil = (eventToken: string) => api(page, 'POST', `/api/vendors/${STALL_VENDOR_ID}/scanner/fulfil-event-pickup`, { eventToken });

  // A code whose signature was altered is rejected.
  const tampered = token.slice(0, -4) + (token.endsWith('AAAA') ? 'BBBB' : 'AAAA');
  const bad = await resolve(scanValue(orderId, tampered));
  expect([bad.status, errorCode(bad)]).toEqual([400, 'INVALID_EVENT_PICKUP']);
  const badFulfil = await fulfil(tampered);
  expect([badFulfil.status, errorCode(badFulfil)]).toEqual([400, 'INVALID_EVENT_PICKUP']);

  // A code scanned under a different order id than the QR link claims is rejected.
  const mismatch = await resolve(scanValue(crypto.randomUUID(), token));
  expect([mismatch.status, errorCode(mismatch)]).toEqual([400, 'INVALID_EVENT_PICKUP']);

  // Valid, started, paid: resolves with the items to hand over.
  const ok = await resolve(raw);
  expect(ok.status).toBe(200);
  expect((ok.json as { data: { kind: string; items: Array<{ name: string; quantity: number }> } }).data).toMatchObject({ kind: 'event_pickup', items: [{ name: ITEM, quantity: 2 }] });

  const collected = await fulfil(token);
  expect(collected.status, JSON.stringify(collected.json)).toBe(200);

  // Second scan of the same code: already collected, on both steps.
  const again = await resolve(raw);
  expect([again.status, errorCode(again)]).toEqual([409, 'EVENT_PICKUP_COLLECTED']);
  const againFulfil = await fulfil(token);
  expect([againFulfil.status, errorCode(againFulfil)]).toEqual([409, 'EVENT_PICKUP_COLLECTED']);
  await vendor.context.close();
});

test('a code cannot be collected before its booked pickup time', async ({ browser }) => {
  test.skip(malaysiaNow().minutes >= 21 * 60 + 45, 'the later pickup window has already started, so there is nothing "not yet" to test');
  const { orderId, pickup } = await reserveAndPay(browser, LATE_SLOT_TEXT, 1, 'ev10_late_order');
  expect(pickup.pickupLabels[0]).toContain('21:45');

  const vendor = await contextFor(browser, ACCOUNTS.eventVendorB);
  const { page } = vendor;
  const resolve = await api(page, 'POST', `/api/vendors/${STALL_VENDOR_ID}/scanner/resolve`, { rawValue: scanValue(orderId, pickup.eventToken) });
  expect([resolve.status, errorCode(resolve)]).toEqual([409, 'EVENT_PICKUP_NOT_YET']);
  // The database enforces the same rule, so calling the pickup endpoint directly cannot skip the scanner check.
  const fulfil = await api(page, 'POST', `/api/vendors/${STALL_VENDOR_ID}/scanner/fulfil-event-pickup`, { eventToken: pickup.eventToken });
  expect([fulfil.status, errorCode(fulfil)]).toEqual([409, 'EVENT_PICKUP_NOT_YET']);
  await vendor.context.close();
});

test.afterAll(async ({ browser }) => {
  test.setTimeout(180_000);
  // Put the event fee back the way it was (unset: event items fall back to the vendor's tier fee).
  const admin = await contextFor(browser, ACCOUNTS.admin);
  await setEventFee(admin.page, null);
  await admin.context.close();
});
