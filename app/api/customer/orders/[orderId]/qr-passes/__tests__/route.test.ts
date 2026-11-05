import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, from: mocks.from })) }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn(() => ({ from: mocks.from })) }));

import { GET } from "../route";
import { verifyTicketPassToken } from "@/lib/tickets/tokens";
import { verifyFoodFulfilmentToken } from "@/lib/food/food-fulfilment-token";
import { verifyEventPickupToken } from "@/lib/events/event-pickup-token";
import { verifyRetailPickupToken } from "@/lib/orders/retail-pickup-token";
import { hashGuestCredential } from "@/lib/checkout/guest-session";

function query(data: unknown, error: { code: string; message: string } | null = null) {
  const result = Promise.resolve({ data, error });
  const builder: Record<string, unknown> = {};
  for (const key of ["select", "eq", "is", "gt"]) builder[key] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(() => result);
  builder.then = result.then.bind(result);
  return builder;
}

describe("GET customer order QR passes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "customer-1" } }, error: null });
    mocks.from.mockImplementation((table: string) => {
      if (table === "orders") return query({ id: "1d4057cf-c821-4b05-a454-61dbdc42d32c", status: "paid", user_id: "customer-1" });
      if (table === "bookings") return query([{ id: "booking-1", order_items: { outlet_id: "outlet-1", vendor_id: "vendor-a", outlets: { id: "outlet-1", name: "North Outlet", vendor_id: "vendor-a", vendors: { id: "vendor-a", name: "Vendor A" } } }, ticket_passes: { id: "pass-1", policy: "multi_entry", entry_limit: 3, entries_used: 1, status: "active", valid_from: "2026-09-21T10:00:00Z", valid_until: "2026-10-21T10:00:00Z" } }]);
      return query([{
        outlet_id: "food-outlet",
        vendor_id: "vendor-b",
        product_name: "Nasi Lemak",
        variant_name: "Regular",
        quantity: 2,
        food_fulfilment_mode: "takeaway",
        food_qr_scanned_at: null,
        fulfil_status: "pending",
        products: { categories: { slug: "food" } },
        outlets: { id: "food-outlet", name: "Kedai Makan", vendor_id: "vendor-b", vendors: { id: "vendor-b", name: "Vendor B" } },
      }]);
    });
  });

  it("returns a server-signed token bound to the current database pass", async () => {
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ orderId: "1d4057cf-c821-4b05-a454-61dbdc42d32c" }) });
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.data.tickets).toHaveLength(1);
    expect(verifyTicketPassToken(json.data.tickets[0].passToken).claims).toMatchObject({
      bookingId: "booking-1", passId: "pass-1", outletId: "outlet-1", policy: "multi_entry", entryLimit: 3,
    });
    expect(json.data.tickets[0]).toMatchObject({ entriesUsed: 1, validUntil: "2026-10-21T10:00:00Z" });
    expect(json.data.tickets[0]).toMatchObject({ vendorName: "Vendor A", outletName: "North Outlet" });
    expect(json.data.foodOrders[0]).toMatchObject({ outletId: "food-outlet", mode: "takeaway", status: "pending", vendorName: "Vendor B", outletName: "Kedai Makan" });
    expect(verifyFoodFulfilmentToken(json.data.foodOrders[0].foodToken).claims).toMatchObject({ orderId: "1d4057cf-c821-4b05-a454-61dbdc42d32c", outletId: "food-outlet" });
  });

  it("issues a group-ticket QR with the database guest limit and the matching merchant", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "orders") return query({ id: "1d4057cf-c821-4b05-a454-61dbdc42d32c", status: "paid", user_id: "customer-1" });
      if (table === "bookings") return query([{
        id: "booking-1",
        order_items: { outlet_id: "outlet-a", vendor_id: "vendor-a", outlets: { id: "outlet-a", name: "Outlet A", vendor_id: "vendor-a", vendors: { id: "vendor-a", name: "Vendor A" } } },
        ticket_passes: { id: "pass-group", policy: "group_entry", entry_limit: 5, entries_used: 2, status: "active", valid_from: null, valid_until: null },
      }]);
      return query([]);
    });

    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ orderId: "1d4057cf-c821-4b05-a454-61dbdc42d32c" }) });
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(verifyTicketPassToken(json.data.tickets[0].passToken).claims).toMatchObject({
      bookingId: "booking-1", passId: "pass-group", outletId: "outlet-a", policy: "group_entry", entryLimit: 5,
    });
    expect(json.data.tickets[0]).toMatchObject({ vendorName: "Vendor A", outletName: "Outlet A", entriesUsed: 2 });
  });

  it.each(["food_fulfilment_mode", "food_qr_scanned_at"])("still returns booking passes when optional food column %s is not migrated", async (column) => {
    let orderItemReads = 0;
    mocks.from.mockImplementation((table: string) => {
      if (table === "orders") return query({ id: "1d4057cf-c821-4b05-a454-61dbdc42d32c", status: "paid", user_id: "customer-1" });
      if (table === "bookings") return query([{
        id: "booking-1",
        order_items: { outlet_id: "outlet-1", vendor_id: "vendor-a", outlets: { id: "outlet-1", name: "North Outlet", vendor_id: "vendor-a", vendors: { id: "vendor-a", name: "Vendor A" } } },
        ticket_passes: [{ id: "pass-1", policy: "single_entry", entry_limit: 1, entries_used: 0, status: "active", valid_from: null, valid_until: null }],
      }]);
      if (table === "order_items" && orderItemReads++ === 0) return query(null, {
          code: "42703",
          message: `column order_items.${column} does not exist`,
        });
      return query([]);
    });

    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ orderId: "1d4057cf-c821-4b05-a454-61dbdc42d32c" }) });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.tickets).toHaveLength(1);
    expect(verifyTicketPassToken(json.data.tickets[0].passToken).claims).toMatchObject({
      bookingId: "booking-1", passId: "pass-1", outletId: "outlet-1",
    });
    expect(json.data.foodOrders).toEqual([]);
  });

  it("does not hide unrelated food order query failures", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "orders") return query({ id: "1d4057cf-c821-4b05-a454-61dbdc42d32c", status: "paid", user_id: "customer-1" });
      if (table === "bookings") return query([]);
      return query(null, { code: "42501", message: "permission denied for table order_items" });
    });

    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ orderId: "1d4057cf-c821-4b05-a454-61dbdc42d32c" }) });

    expect(response.status).toBe(500);
  });

  it("does not issue QR tokens for an unpaid order", async () => {
    mocks.from.mockImplementation((table: string) => table === "orders" ? query({ id: "1d4057cf-c821-4b05-a454-61dbdc42d32c", status: "pending_payment", user_id: "customer-1" }) : query([]));
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ orderId: "1d4057cf-c821-4b05-a454-61dbdc42d32c" }) });
    expect(response.status).toBe(409);
  });

  it("reports dine-in arrival separately from food fulfilment", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "orders") return query({ id: "1d4057cf-c821-4b05-a454-61dbdc42d32c", status: "paid", user_id: "customer-1" });
      if (table === "bookings") return query([]);
      return query([{
        outlet_id: "food-outlet", vendor_id: "vendor-b", product_name: "Nasi Lemak", variant_name: null, quantity: 1,
        food_fulfilment_mode: "dine_in", food_qr_scanned_at: "2026-09-21T10:00:00Z", fulfil_status: "pending",
        products: { categories: { slug: "food" } }, outlets: { id: "food-outlet", name: "Kedai Makan", vendor_id: "vendor-b", vendors: { id: "vendor-b", name: "Vendor B" } },
      }]);
    });
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ orderId: "1d4057cf-c821-4b05-a454-61dbdc42d32c" }) });
    expect((await response.json()).data.foodOrders[0].status).toBe("checked_in");
  });

  it("reports takeaway as fulfilled only after the outlet records delivery", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "orders") return query({ id: "1d4057cf-c821-4b05-a454-61dbdc42d32c", status: "paid", user_id: "customer-1" });
      if (table === "bookings") return query([]);
      return query([{
        outlet_id: "food-outlet", vendor_id: "vendor-b", product_name: "Nasi Lemak", variant_name: null, quantity: 1,
        food_fulfilment_mode: "takeaway", food_qr_scanned_at: "2026-09-21T10:00:00Z", fulfil_status: "fulfilled",
        products: { categories: { slug: "food" } }, outlets: { id: "food-outlet", name: "Kedai Makan", vendor_id: "vendor-b", vendors: { id: "vendor-b", name: "Vendor B" } },
      }]);
    });
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ orderId: "1d4057cf-c821-4b05-a454-61dbdc42d32c" }) });
    expect((await response.json()).data.foodOrders[0].status).toBe("fulfilled");
  });

  it("issues a separate pickup code for each vendor, location, date, and slot", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "orders") return query({ id: "1d4057cf-c821-4b05-a454-61dbdc42d32c", status: "paid", user_id: "customer-1" });
      if (table === "bookings") return query([]);
      return query([
        { vendor_id: "vendor-e", event_location_id: "loc-1", pickup_date: "2099-12-31", pickup_slot_id: "44444444-4444-4444-8444-444444444444", slot_starts_at: "2099-12-31T02:00:00.000Z", product_name: "Kuih", variant_name: "Main hall · 10:00–11:00", quantity: 2, fulfil_status: "pending", vendors: { name: "Kuih Stall" }, outlet_id: null, products: null },
        { vendor_id: "vendor-e", event_location_id: "loc-1", pickup_date: "2099-12-31", pickup_slot_id: "44444444-4444-4444-8444-444444444444", slot_starts_at: "2099-12-31T02:00:00.000Z", product_name: "Teh", variant_name: "Main hall · 10:00–11:00", quantity: 1, fulfil_status: "pending", vendors: { name: "Kuih Stall" }, outlet_id: null, products: null },
        { vendor_id: "vendor-e", event_location_id: "loc-1", pickup_date: "2099-12-31", pickup_slot_id: "55555555-5555-4555-8555-555555555555", slot_starts_at: "2099-12-31T04:00:00.000Z", product_name: "Nasi", variant_name: "Main hall · 12:00–13:00", quantity: 1, fulfil_status: "pending", vendors: { name: "Kuih Stall" }, outlet_id: null, products: null },
        { vendor_id: "vendor-e", event_location_id: "loc-1", pickup_date: "2099-12-30", pickup_slot_id: "slot-old", slot_starts_at: "2099-12-30T04:00:00.000Z", product_name: "Kuih", variant_name: "Main hall · 12:00–13:00", quantity: 1, fulfil_status: "cancelled", vendors: { name: "Kuih Stall" }, outlet_id: null, products: null },
      ]);
    });

    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ orderId: "1d4057cf-c821-4b05-a454-61dbdc42d32c" }) });
    const pickups = (await response.json()).data.eventPickups;

    expect(pickups).toHaveLength(2);
    const morning = pickups.find((pickup: { pickupLabels: string[] }) => pickup.pickupLabels[0] === "Main hall · 10:00–11:00");
    const afternoon = pickups.find((pickup: { pickupLabels: string[] }) => pickup.pickupLabels[0] === "Main hall · 12:00–13:00");
    expect(morning).toMatchObject({ vendorName: "Kuih Stall", pickupDate: "2099-12-31", pickupLabels: ["Main hall · 10:00–11:00"], status: "pending" });
    expect(morning.items).toEqual([{ name: "Kuih", quantity: 2 }, { name: "Teh", quantity: 1 }]);
    expect(afternoon.items).toEqual([{ name: "Nasi", quantity: 1 }]);
    const verifiedMorning = verifyEventPickupToken(morning.eventToken);
    expect(verifiedMorning.valid).toBe(true);
    expect(verifiedMorning.claims).toMatchObject({ orderId: "1d4057cf-c821-4b05-a454-61dbdc42d32c", vendorId: "vendor-e", locationId: "loc-1", pickupDate: "2099-12-31", pickupSlotId: "44444444-4444-4444-8444-444444444444" });
    expect(verifyEventPickupToken(afternoon.eventToken).claims).toMatchObject({ pickupSlotId: "55555555-5555-4555-8555-555555555555" });
  });
});

describe('retail pickup database UUID compatibility through real order authorization', () => {
  const ids = { orderId: '10000000-0000-4000-8000-000000000001', orderItemId: '10000000-0000-4000-8000-000000000002', vendorId: 'bbbbbbbb-2222-accc-3ddd-000000000003', outletId: 'cccccccc-dddd-aeee-3fff-111111111111' };
  const secret = 'synthetic-guest-uuid-regression-secret';
  const credential = 'A'.repeat(43);
  let subject: 'account' | 'guest';
  let sessionAvailable: boolean;
  let orderStatus: string;
  let fulfilStatus: string;
  let scannedAt: string | null;
  let refundStatus: string | null;
  let vendorStatus: string;
  let outletStatus: string;
  const reads: Array<{ table: string; builder: ReturnType<typeof query> }> = [];
  function request(cookie: string | null = credential) {
    return new Request(`https://portal.example.test/api/customer/orders/${ids.orderId}/qr-passes`, {
      headers: cookie === null ? {} : { cookie: `__Host-mylawatan-order-access=${cookie}` },
    });
  }
  async function load(cookie: string | null = credential) {
    return GET(request(cookie), { params: Promise.resolve({ orderId: ids.orderId }) });
  }
  beforeEach(() => {
    vi.clearAllMocks(); reads.length = 0;
    subject = 'guest'; sessionAvailable = true; orderStatus = 'paid'; fulfilStatus = 'pending';
    scannedAt = null; refundStatus = null; vendorStatus = 'approved'; outletStatus = 'active';
    vi.stubEnv('RETAIL_PICKUP_QR_SECRET', secret);
    mocks.getUser.mockImplementation(async () => ({ data: { user: subject === 'account' ? { id: 'customer-1' } : null }, error: null }));
    mocks.from.mockImplementation((table: string) => {
      let data: unknown = [];
      if (table === 'guest_order_access_sessions') data = sessionAvailable ? { order_id: ids.orderId, created_at: '2020-01-01T00:00:00Z' } : null;
      if (table === 'orders') data = { id: ids.orderId, status: orderStatus, user_id: subject === 'account' ? 'customer-1' : null, guest_subject_id: subject === 'guest' ? 'guest-fixture' : null, guest_session_revoked_at: null };
      if (table === 'order_items') data = [{
        id: ids.orderItemId, vendor_id: ids.vendorId, outlet_id: ids.outletId, product_name: 'Synthetic retail', variant_name: 'Box', quantity: 2,
        food_fulfilment_mode: null, food_qr_scanned_at: null, retail_qr_scanned_at: scannedAt, fulfil_status: fulfilStatus,
        event_location_id: null, event_listing_id: null, slot_starts_at: null,
        products: { requires_booking: false, product_type: 'product', categories: { slug: 'retail' } },
        outlets: { id: ids.outletId, name: 'Synthetic outlet', status: outletStatus, vendor_id: ids.vendorId, vendors: { id: ids.vendorId, name: 'Synthetic vendor', status: vendorStatus } },
      }];
      if (table === 'refunds') data = refundStatus ? [{ status: refundStatus, provider_refund_id: null, provider_failure_code: null, provider_failure_message: null }] : [];
      const builder = query(data); reads.push({ table, builder }); return builder;
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each(['account', 'guest'] as const)('issues a verified legacy-ID retail token for a paid %s order', async kind => {
    subject = kind;
    const response = await load();
    expect(response.status).toBe(200);
    const pass = (await response.json()).data.retailPickups[0];
    expect(pass).toMatchObject({ orderItemId: ids.orderItemId, quantity: 2, status: 'pending' });
    expect(verifyRetailPickupToken(pass.retailToken, secret)).toMatchObject({ valid: true, claims: ids });
    const orderRead = reads.find(read => read.table === 'orders')!.builder;
    expect(orderRead.eq).toHaveBeenCalledWith('id', ids.orderId);
    if (kind === 'guest') {
      const sessionRead = reads.find(read => read.table === 'guest_order_access_sessions')!.builder;
      expect(sessionRead.eq).toHaveBeenCalledWith('token_hash', hashGuestCredential(credential));
      expect(sessionRead.eq).toHaveBeenCalledWith('order_id', ids.orderId);
      expect(sessionRead.is).toHaveBeenCalledWith('revoked_at', null);
      expect(sessionRead.gt).toHaveBeenCalledWith('expires_at', expect.any(String));
      expect(orderRead.is).toHaveBeenCalledWith('user_id', null);
    } else expect(orderRead.eq).toHaveBeenCalledWith('user_id', 'customer-1');
  });

  it.each([null, 'invalid-cookie'])('denies a Guest without a valid credential: %s', async cookie => {
    expect((await load(cookie)).status).toBe(404);
    expect(reads).toHaveLength(0);
  });
  it('denies a Guest session lookup with no exact unrevoked and unexpired match', async () => {
    sessionAvailable = false;
    expect((await load()).status).toBe(404);
    expect(reads.map(read => read.table)).toEqual(['guest_order_access_sessions']);
    const sessionRead = reads[0].builder;
    expect(sessionRead.eq).toHaveBeenCalledWith('order_id', ids.orderId);
    expect(sessionRead.is).toHaveBeenCalledWith('revoked_at', null);
    expect(sessionRead.gt).toHaveBeenCalledWith('expires_at', expect.any(String));
  });
  it('does not issue a token before payment', async () => { orderStatus = 'pending_payment'; expect((await load()).status).toBe(409); });
  it.each([
    ['pending', null, 'pending', 'refund_paused'],
    ['fulfilled', '2026-10-28T00:00:00Z', null, 'collected'],
    ['fulfilled', null, null, 'legacy_completed'],
  ])('does not issue an active token for %s / %s / refund=%s', async (fulfil, scanned, refund, expected) => {
    fulfilStatus = fulfil!; scannedAt = scanned; refundStatus = refund;
    const response = await load();
    expect(response.status).toBe(200);
    expect((await response.json()).data.retailPickups[0]).toMatchObject({ status: expected, retailToken: null });
  });
  it('excludes cancelled retail lines', async () => {
    fulfilStatus = 'cancelled';
    expect((await (await load()).json()).data.retailPickups).toEqual([]);
  });
  it.each(['vendor', 'outlet'])('refuses a code for unavailable %s identity', async kind => {
    if (kind === 'vendor') vendorStatus = 'pending'; else outletStatus = 'inactive';
    const response = await load();
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('MERCHANT_IDENTITY_UNAVAILABLE');
  });
});
