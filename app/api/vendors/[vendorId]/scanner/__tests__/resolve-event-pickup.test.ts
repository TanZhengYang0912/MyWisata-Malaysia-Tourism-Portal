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

const mocks = vi.hoisted(() => ({ authorizeVendor: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/vendor-authorization", () => ({ authorizeVendor: mocks.authorizeVendor }));

import { POST } from "../resolve/route";

function query(data: unknown, error: { message: string } | null = null) {
  const result = Promise.resolve({ data, error });
  const builder: Record<string, unknown> = {};
  for (const key of ["select", "eq", "neq"]) builder[key] = vi.fn(() => builder);
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

function setupRows(rows: unknown[]) {
  mocks.from.mockImplementation((table: string) => {
    if (table === "orders") return query({ status: "paid" });
    if (table === "vendors") return query({ id: VENDOR_ID, name: "Event Vendor", status: "approved", kind: "event" });
    return query(rows);
  });
}

async function resolve(rawValue: string) {
  return POST(new Request(`http://localhost/api/vendors/${VENDOR_ID}/scanner/resolve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rawValue }),
  }), { params: Promise.resolve({ vendorId: VENDOR_ID }) });
}

describe("event pickup scanner preview", () => {
  beforeEach(() => {
    vi.stubEnv("EVENT_PICKUP_QR_SECRET", TOKEN_SECRET);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-07T09:59:59+08:00"));
    vi.clearAllMocks();
    mocks.authorizeVendor.mockResolvedValue({ ok: true, access: { serviceDb: { from: mocks.from }, outletIds: [] } });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("rejects a same-day scan before the booked slot starts", async () => {
    setupRows([eventLine("Kuih", MORNING_SLOT_ID, MORNING_START)]);

    const response = await resolve(codeFor(MORNING_SLOT_ID));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "EVENT_PICKUP_NOT_YET" } });
  });

  it("accepts the exact start time and returns only the slot named by the QR", async () => {
    vi.setSystemTime(new Date(MORNING_START));
    setupRows([
      eventLine("Kuih", MORNING_SLOT_ID, MORNING_START),
      eventLine("Nasi", AFTERNOON_SLOT_ID, AFTERNOON_START),
    ]);

    const response = await resolve(codeFor(MORNING_SLOT_ID));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { kind: "event_pickup", items: [{ name: "Kuih" }] } });
  });

  it("keeps legacy date-only codes blocked until every open slot has started", async () => {
    vi.setSystemTime(new Date("2026-10-07T10:30:00+08:00"));
    setupRows([
      eventLine("Kuih", MORNING_SLOT_ID, MORNING_START),
      eventLine("Nasi", AFTERNOON_SLOT_ID, AFTERNOON_START),
    ]);

    const response = await resolve(codeFor());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "EVENT_PICKUP_NOT_YET" } });
  });
});
