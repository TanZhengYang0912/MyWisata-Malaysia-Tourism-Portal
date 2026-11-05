import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authorizeOrder: vi.fn(), serviceFrom: vi.fn() }));

vi.mock("@/lib/checkout/order-access", () => ({ authorizeOrder: mocks.authorizeOrder }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ from: mocks.serviceFrom }) }));
vi.mock("@/backend/domains/commerce", () => ({
  ORDER_SELECT: "safe-order-select",
  BOOKING_SELECT: "safe-booking-select",
  mapOrder: (value: unknown) => value,
  mapBooking: (value: unknown) => value,
}));

import { GET } from "../route";

const orderId = "11111111-1111-4111-8111-111111111111";
const order = { id: orderId, display_id: "ORD-1001", status: "paid" };

function query(table: string, error: unknown = null) {
  const data = table === "orders" ? order : table === "bookings" ? [] : {
    status: "pending",
    amount: 42.5,
    created_at: "2026-10-01T00:00:00.000Z",
    processed_at: null,
    reason: "private reason must not leak",
    provider_refund_id: "private-provider-reference",
  };
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "limit"]) builder[method] = vi.fn(() => builder);
  builder.single = vi.fn(async () => ({ data, error }));
  builder.maybeSingle = vi.fn(async () => ({ data, error }));
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error }).then(resolve);
  return builder;
}

describe("customer order detail refund projection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeOrder.mockResolvedValue({ db: { from: mocks.serviceFrom }, userId: "user-1", guestSubjectId: null });
    mocks.serviceFrom.mockImplementation((table: string) => query(table));
  });

  it("returns only the latest public refund state after exact order authorization", async () => {
    const response = await GET(new Request("https://mylawatan.test"), { params: Promise.resolve({ orderId }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.authorizeOrder).toHaveBeenCalledWith(expect.any(Request), orderId);
    expect(body.data.refundStatus).toEqual({
      status: "pending",
      amount: 42.5,
      createdAt: "2026-10-01T00:00:00.000Z",
      processedAt: null,
    });
    expect(JSON.stringify(body)).not.toContain("private reason");
    expect(JSON.stringify(body)).not.toContain("private-provider-reference");
    const refundQuery = mocks.serviceFrom.mock.results.find((_result, index) => mocks.serviceFrom.mock.calls[index][0] === "refunds")?.value;
    expect(refundQuery.select).toHaveBeenCalledWith("status,amount,created_at,processed_at");
    expect(refundQuery.eq).toHaveBeenCalledWith("order_id", orderId);
    expect(refundQuery.limit).toHaveBeenCalledWith(1);
  });

  it("does not query refund data for an unauthorized order", async () => {
    mocks.authorizeOrder.mockResolvedValue(null);
    const response = await GET(new Request("https://mylawatan.test"), { params: Promise.resolve({ orderId }) });

    expect(response.status).toBe(404);
    expect(mocks.serviceFrom).not.toHaveBeenCalled();
  });

  it("keeps a readable order available when its optional booking projection fails", async () => {
    mocks.serviceFrom.mockImplementation((table: string) =>
      table === "bookings" ? query(table, new Error("booking projection unavailable")) : query(table),
    );

    const response = await GET(new Request("https://mylawatan.test"), { params: Promise.resolve({ orderId }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.order.id).toBe(orderId);
    expect(body.data.bookings).toEqual([]);
    expect(body.data.bookingsUnavailable).toBe(true);
  });
});
