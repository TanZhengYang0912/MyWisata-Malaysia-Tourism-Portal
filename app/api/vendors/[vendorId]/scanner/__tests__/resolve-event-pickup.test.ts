import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signEventPickupToken } from "@/lib/events/event-pickup-token";

const VENDOR_ID = "22222222-2222-4222-8222-222222222222";
const LOCATION_ID = "33333333-3333-4333-8333-333333333333";
const MORNING_SLOT_ID = "44444444-4444-4444-8444-444444444444";
const AFTERNOON_SLOT_ID = "55555555-5555-4555-8555-555555555555";
const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const TOKEN_SECRET = "resolve-event-pickup-test-secret";
const PICKUP_DATE = "2026-10-07";
const MORNING_START = "2026-10-07T10:00:00+08:00";
const AFTERNOON_START = "2026-10-07T12:00:00+08:00";

const mocks = vi.hoisted(() => ({ authorizeVendor: vi.fn(), from: vi.fn(), inserts: [] as Array<{ table: string; row: unknown }>, auditError: null as { message: string } | null }));
vi.mock("@/lib/vendor-authorization", () => ({ authorizeVendor: mocks.authorizeVendor }));

import { POST } from "../resolve/route";

function query(data: unknown, error: { message: string } | null = null, table = "") {
  const result = Promise.resolve({ data, error });
  const builder: Record<string, unknown> = {};
  for (const key of ["select", "eq", "neq"]) builder[key] = vi.fn(() => builder);
  builder.insert = vi.fn((row: unknown) => {
    mocks.inserts.push({ table, row });
    return Promise.resolve({ data: null, error: table === "audit_logs" ? mocks.auditError : null });
  });
  builder.maybeSingle = vi.fn(() => result);
  builder.then = result.then.bind(result);
  return builder;
}

function eventLine(id: string, pickupSlotId: string, slotStartsAt: string) {
  return {
    id,
    product_name: id,
    variant_name: `Main hall · ${slotStartsAt.slice(11, 16)}`,
    quantity: 1,
    fulfil_status: "pending",
    pickup_slot_id: pickupSlotId,
    slot_starts_at: slotStartsAt,
  };
}

function codeFor(pickupSlotId?: string) {
  const claims = {
    orderId: ORDER_ID,
    vendorId: VENDOR_ID,
    locationId: LOCATION_ID,
    pickupDate: PICKUP_DATE,
    issuedAt: Date.now(),
  };
  const eventToken = pickupSlotId
    ? signEventPickupToken({ ...claims, pickupSlotId }, TOKEN_SECRET)
    : signEventPickupToken(claims, TOKEN_SECRET);
  return `http://localhost/customer/orders/${ORDER_ID}?event_t=${eventToken}`;
}

const STAFF_CAMPAIGN = "77777777-7777-4777-8777-777777777777";

function setupRows(rows: unknown[], locationCampaignId = STAFF_CAMPAIGN) {
  mocks.from.mockImplementation((table: string) => {
    if (table === "orders") return query({ status: "paid" });
    if (table === "vendors") return query({ id: VENDOR_ID, name: "Event Vendor", status: "approved", kind: "event" });
    if (table === "promotion_campaign_locations") return query({ campaign_id: locationCampaignId });
    if (table === "audit_logs") return query(null, null, "audit_logs");
    return query(rows);
  });
}

function asStaff(eventCampaignIds = [STAFF_CAMPAIGN]) {
  mocks.authorizeVendor.mockResolvedValue({
    ok: true,
    access: { userId: "staff-1", role: "event_staff", eventCampaignIds, outletIds: [], serviceDb: { from: mocks.from } },
  });
}

async function resolve(rawValue: string, eventLocationId?: string, pickupDate?: string) {
  return POST(new Request(`http://localhost/api/vendors/${VENDOR_ID}/scanner/resolve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rawValue, ...(eventLocationId ? { eventLocationId } : {}), ...(pickupDate ? { pickupDate } : {}) }),
  }), { params: Promise.resolve({ vendorId: VENDOR_ID }) });
}

describe("event pickup scanner preview", () => {
  beforeEach(() => {
    vi.stubEnv("EVENT_PICKUP_QR_SECRET", TOKEN_SECRET);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-07T09:59:59+08:00"));
    vi.clearAllMocks();
    mocks.inserts = [];
    mocks.auditError = null;
    mocks.authorizeVendor.mockResolvedValue({
      ok: true,
      access: { userId: "owner-1", role: "vendor_owner", eventCampaignIds: [], serviceDb: { from: mocks.from }, outletIds: [] },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("rejects a same-day scan before the booked slot starts", async () => {
    setupRows([eventLine("Kuih", MORNING_SLOT_ID, MORNING_START)]);

    const response = await resolve(codeFor(MORNING_SLOT_ID), LOCATION_ID, PICKUP_DATE);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "EVENT_PICKUP_NOT_YET" } });
  });

  it("requires the scanner's selected event location and date to match the QR", async () => {
    const missingContext = await resolve(codeFor(MORNING_SLOT_ID));
    expect(missingContext.status).toBe(409);
    await expect(missingContext.json()).resolves.toMatchObject({ error: { code: "EVENT_CONTEXT_REQUIRED" } });

    const wrongLocation = await resolve(codeFor(MORNING_SLOT_ID), "66666666-6666-4666-8666-666666666666", PICKUP_DATE);
    expect(wrongLocation.status).toBe(409);
    await expect(wrongLocation.json()).resolves.toMatchObject({ error: { code: "EVENT_CONTEXT_MISMATCH" } });

    const wrongDate = await resolve(codeFor(MORNING_SLOT_ID), LOCATION_ID, "2026-10-08");
    expect(wrongDate.status).toBe(409);
    await expect(wrongDate.json()).resolves.toMatchObject({ error: { code: "EVENT_CONTEXT_MISMATCH" } });
  });

  it("does not resolve other code types at an event reservation station", async () => {
    const response = await resolve("http://localhost/customer/orders/not-an-event-pickup", LOCATION_ID, PICKUP_DATE);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "EVENT_CODE_REQUIRED" } });
  });

  it("accepts the exact start time and returns only the slot named by the QR", async () => {
    vi.setSystemTime(new Date(MORNING_START));
    setupRows([
      eventLine("Kuih", MORNING_SLOT_ID, MORNING_START),
      eventLine("Nasi", AFTERNOON_SLOT_ID, AFTERNOON_START),
    ]);

    const response = await resolve(codeFor(MORNING_SLOT_ID), LOCATION_ID, PICKUP_DATE);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { kind: "event_pickup", items: [{ name: "Kuih" }] } });
  });

  it("keeps legacy date-only codes blocked until every open slot has started", async () => {
    vi.setSystemTime(new Date("2026-10-07T10:30:00+08:00"));
    setupRows([
      eventLine("Kuih", MORNING_SLOT_ID, MORNING_START),
      eventLine("Nasi", AFTERNOON_SLOT_ID, AFTERNOON_START),
    ]);

    const response = await resolve(codeFor(), LOCATION_ID, PICKUP_DATE);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "EVENT_PICKUP_NOT_YET" } });
  });

  it("opts the route in for event staff", async () => {
    setupRows([eventLine("Kuih", MORNING_SLOT_ID, MORNING_START)]);
    await resolve(codeFor(MORNING_SLOT_ID), LOCATION_ID, PICKUP_DATE);
    expect(mocks.authorizeVendor).toHaveBeenCalledWith(VENDOR_ID, undefined, { allowEventVendor: true, allowEventStaff: true });
  });

  it("records who looked up a reservation", async () => {
    vi.setSystemTime(new Date(MORNING_START));
    setupRows([eventLine("Kuih", MORNING_SLOT_ID, MORNING_START)]);

    const response = await resolve(codeFor(MORNING_SLOT_ID), LOCATION_ID, PICKUP_DATE);

    expect(response.status).toBe(200);
    expect(mocks.inserts).toEqual([{
      table: "audit_logs",
      row: {
        actor_id: "owner-1",
        action: "event_pickup.scanned",
        entity_type: "order",
        entity_id: ORDER_ID,
        after_data: { vendor_id: VENDOR_ID, location_id: LOCATION_ID, pickup_date: PICKUP_DATE, role: "vendor_owner" },
      },
    }]);
  });

  it("does not show the reservation when the scan cannot be recorded", async () => {
    vi.setSystemTime(new Date(MORNING_START));
    setupRows([eventLine("Kuih", MORNING_SLOT_ID, MORNING_START)]);
    mocks.auditError = { message: "insert failed" };

    const response = await resolve(codeFor(MORNING_SLOT_ID), LOCATION_ID, PICKUP_DATE);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "SCAN_NOT_RECORDED" } });
  });

  it("lets staff resolve a pickup at a location of their event and records them", async () => {
    vi.setSystemTime(new Date(MORNING_START));
    asStaff();
    setupRows([eventLine("Kuih", MORNING_SLOT_ID, MORNING_START)]);

    const response = await resolve(codeFor(MORNING_SLOT_ID), LOCATION_ID, PICKUP_DATE);

    expect(response.status).toBe(200);
    expect(mocks.inserts).toMatchObject([{ table: "audit_logs", row: { actor_id: "staff-1", after_data: { role: "event_staff" } } }]);
  });

  it("rejects staff at a location outside their event before reading the order", async () => {
    vi.setSystemTime(new Date(MORNING_START));
    asStaff();
    setupRows([eventLine("Kuih", MORNING_SLOT_ID, MORNING_START)], "88888888-8888-4888-8888-888888888888");

    const response = await resolve(codeFor(MORNING_SLOT_ID), LOCATION_ID, PICKUP_DATE);

    expect(response.status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalledWith("order_items");
    expect(mocks.from).not.toHaveBeenCalledWith("orders");
    expect(mocks.inserts).toEqual([]);
  });

  it("requires staff to scan from an event location and date", async () => {
    asStaff();
    setupRows([]);

    const response = await resolve(codeFor(MORNING_SLOT_ID));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "EVENT_CONTEXT_REQUIRED" } });
    expect(mocks.from).not.toHaveBeenCalledWith("promotion_campaign_locations");
  });

  it("keeps non-event codes closed to staff", async () => {
    asStaff();
    setupRows([]);

    const response = await resolve("http://localhost/customer/orders/not-an-event-pickup", LOCATION_ID, PICKUP_DATE);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "EVENT_CODE_REQUIRED" } });
  });
});
