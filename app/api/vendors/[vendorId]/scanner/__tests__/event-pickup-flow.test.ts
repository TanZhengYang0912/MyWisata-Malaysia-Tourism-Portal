import { beforeEach, describe, expect, it, vi } from "vitest";

const VENDOR_ID = "22222222-2222-4222-8222-222222222222";
const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const LOCATION_ID = "33333333-3333-4333-8333-333333333333";
const SLOT_ID = "44444444-4444-4444-8444-444444444444";
const CUSTOMER_ID = "55555555-5555-4555-8555-555555555555";
const OPERATOR_ID = "66666666-6666-4666-8666-666666666666";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), rpc: vi.fn(), authorizeVendor: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, from: mocks.from })) }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn(() => ({ from: mocks.from })) }));
vi.mock("@/lib/vendor-authorization", () => ({ authorizeVendor: mocks.authorizeVendor }));

import { GET as getQrPasses } from "@/app/api/customer/orders/[orderId]/qr-passes/route";
import { POST as resolveScan } from "../resolve/route";
import { POST as fulfilPickup } from "../fulfil-event-pickup/route";
import { GET as getRedemptionHistory } from "@/app/api/vendors/[vendorId]/redemptions/route";
import { verifyEventPickupToken } from "@/lib/events/event-pickup-token";

const database = {
  order: { id: ORDER_ID, user_id: CUSTOMER_ID, status: "pending_payment" },
  location: { id: LOCATION_ID, name: "Main Hall", address: "Kuala Lumpur" },
  orderItems: [] as Array<Record<string, unknown>>,
  auditLogs: [] as Array<Record<string, unknown>>,
};

function malaysiaDate() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function tableRows(table: string) {
  if (table === "orders") return [database.order];
  if (table === "bookings") return [];
  if (table === "order_items") return database.orderItems;
  if (table === "vendors") return [{ id: VENDOR_ID, name: "Event Partner", status: "approved", kind: "event" }];
  if (table === "audit_logs") return database.auditLogs;
  if (table === "promotion_campaign_locations") return [database.location];
  if (table === "users") return [
    { id: CUSTOMER_ID, full_name: "Aina Customer", email: "aina@example.test" },
    { id: OPERATOR_ID, full_name: "Event Operator", email: "operator@example.test" },
  ];
  return [];
}

function from(table: string) {
  const filters: Array<(row: Record<string, unknown>) => boolean> = [];
  const result = () => tableRows(table).filter((row) => filters.every((filter) => filter(row)));
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn((column: string, value: unknown) => {
    filters.push((row) => {
      if (column === "after_data->>vendor_id") return (row.after_data as Record<string, unknown> | undefined)?.vendor_id === value;
      return row[column] === value;
    });
    return builder;
  });
  builder.neq = vi.fn((column: string, value: unknown) => { filters.push((row) => row[column] !== value); return builder; });
  builder.in = vi.fn((column: string, values: unknown[]) => { filters.push((row) => values.includes(row[column])); return builder; });
  builder.not = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(async () => ({ data: result()[0] ?? null, error: null }));
  builder.then = (resolve: (value: { data: Record<string, unknown>[]; error: null }) => unknown) => Promise.resolve({ data: result(), error: null }).then(resolve);
  return builder;
}

describe("event partner payment-to-scan flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.order.status = "pending_payment";
    database.auditLogs = [];
    const pickupStart = new Date(Date.now() - 60_000).toISOString();
    database.orderItems = [
      { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", order_id: ORDER_ID, vendor_id: VENDOR_ID, outlet_id: null, event_location_id: LOCATION_ID, pickup_date: malaysiaDate(), pickup_slot_id: SLOT_ID, slot_starts_at: pickupStart, product_name: "Kuih", variant_name: "Main Hall · Morning", quantity: 2, fulfil_status: "pending", food_fulfilment_mode: null, food_qr_scanned_at: null, products: null, outlets: null, vendors: { name: "Event Partner" } },
      { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", order_id: ORDER_ID, vendor_id: VENDOR_ID, outlet_id: null, event_location_id: LOCATION_ID, pickup_date: malaysiaDate(), pickup_slot_id: SLOT_ID, slot_starts_at: pickupStart, product_name: "Teh", variant_name: "Main Hall · Morning", quantity: 1, fulfil_status: "pending", food_fulfilment_mode: null, food_qr_scanned_at: null, products: null, outlets: null, vendors: { name: "Event Partner" } },
    ];
    mocks.getUser.mockResolvedValue({ data: { user: { id: CUSTOMER_ID } }, error: null });
    mocks.from.mockImplementation(from);
    mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      if (name === "list_vendor_redemption_history") return { data: {
        items: [{
          id: "audit-flow-1", kind: "event_pickup", redeemedAt: new Date().toISOString(),
          outlet: { id: LOCATION_ID, name: "Main Hall", fullName: "Main Hall", location: "Kuala Lumpur" },
          item: { name: "Kuih, Teh", details: "Kuih × 2, Teh × 1" },
          customer: { name: "Aina Customer", email: "aina@example.test" },
        }],
        pagination: { page: 1, pageSize: 15, total: 1, totalPages: 1 },
        stats: { totalCount: 1, retailCount: 0 },
      }, error: null };
      expect(name).toBe("fulfil_event_pickup");
      expect(args.p_pickup_slot_id).toBe(SLOT_ID);
      const items = database.orderItems.filter((row) => row.pickup_slot_id === args.p_pickup_slot_id && row.fulfil_status === "pending");
      items.forEach((row) => { row.fulfil_status = "fulfilled"; });
      const after_data = {
        vendor_id: VENDOR_ID,
        location_id: LOCATION_ID,
        pickup_date: args.p_pickup_date,
        pickup_slot_id: SLOT_ID,
        pickup_times: [database.orderItems[0].slot_starts_at],
        items: items.length,
        item_details: items.map((row) => ({ name: row.product_name, variant: row.variant_name, quantity: row.quantity })),
      };
      database.auditLogs.push({ id: "audit-flow-1", actor_id: OPERATOR_ID, entity_id: ORDER_ID, action: "event_pickup.fulfilled", entity_type: "order", created_at: new Date().toISOString(), after_data });
      return { data: { status: "fulfilled", items: items.length }, error: null };
    });
    mocks.authorizeVendor.mockResolvedValue({ ok: true, access: { userId: OPERATOR_ID, vendorId: VENDOR_ID, outletIds: [], authDb: { from: mocks.from }, serviceDb: { from: mocks.from, rpc: mocks.rpc } } });
  });

  it("reveals QR only after payment, scans the booked slot, fulfils it, and returns its vendor log", async () => {
    const orderParams = { params: Promise.resolve({ orderId: ORDER_ID }) };
    const lockedQr = await getQrPasses(new Request("http://localhost"), orderParams);
    expect(lockedQr.status).toBe(409);

    database.order.status = "paid";
    const qrResponse = await getQrPasses(new Request("http://localhost"), orderParams);
    const qrPayload = await qrResponse.json();
    expect(qrResponse.status).toBe(200);
    expect(qrPayload.data.eventPickups).toHaveLength(1);
    const pass = qrPayload.data.eventPickups[0];
    expect(verifyEventPickupToken(pass.eventToken).claims).toMatchObject({ orderId: ORDER_ID, vendorId: VENDOR_ID, locationId: LOCATION_ID, pickupSlotId: SLOT_ID });

    const scanValue = `http://localhost/customer/orders/${ORDER_ID}?event_t=${pass.eventToken}`;
    const scanResponse = await resolveScan(new Request(`http://localhost/api/vendors/${VENDOR_ID}/scanner/resolve`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rawValue: scanValue }),
    }), { params: Promise.resolve({ vendorId: VENDOR_ID }) });
    const scanPayload = await scanResponse.json();
    expect(scanResponse.status).toBe(200);
    expect(scanPayload.data.items.map((item: { name: string }) => item.name)).toEqual(["Kuih", "Teh"]);

    const fulfilResponse = await fulfilPickup(new Request(`http://localhost/api/vendors/${VENDOR_ID}/scanner/fulfil-event-pickup`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ eventToken: pass.eventToken }),
    }), { params: Promise.resolve({ vendorId: VENDOR_ID }) });
    expect(fulfilResponse.status).toBe(200);
    expect(database.orderItems.every((row) => row.fulfil_status === "fulfilled")).toBe(true);

    const historyResponse = await getRedemptionHistory(new Request(`http://localhost/api/vendors/${VENDOR_ID}/redemptions`), { params: Promise.resolve({ vendorId: VENDOR_ID }) });
    const historyPayload = await historyResponse.json();
    expect(historyResponse.status).toBe(200);
    expect(historyPayload.data.items[0]).toMatchObject({
      id: "audit-flow-1",
      kind: "event_pickup",
      outlet: { id: LOCATION_ID, name: "Main Hall" },
      item: { name: "Kuih, Teh" },
      customer: { name: "Aina Customer", email: "aina@example.test" },
    });
    expect(historyPayload.data.items[0].item.details).toContain("Kuih × 2");
    expect(mocks.rpc).toHaveBeenCalledWith("fulfil_event_pickup", expect.any(Object));
    expect(mocks.rpc).toHaveBeenCalledWith("list_vendor_redemption_history", expect.any(Object));
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });
});
