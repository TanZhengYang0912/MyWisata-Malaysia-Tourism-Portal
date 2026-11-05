import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: vi.fn(async () => ({ data: { user: null } })) }, from: mocks.from })),
}));

import { POST } from "../route";

function query(data: unknown) {
  const result = Promise.resolve({ data, error: null });
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "insert"]) builder[method] = vi.fn(() => builder);
  builder.single = vi.fn(() => result);
  builder.maybeSingle = vi.fn(() => result);
  builder.then = result.then.bind(result);
  return builder;
}

const voucherBase = {
  id: "voucher-a", vendor_id: "vendor-a", outlet_id: null, product_id: null,
  code: "SAVE10", is_active: true, review_status: "approved", redemption_mode: "online",
  valid_from: null, valid_until: "2026-12-31", max_uses: null, uses_count: 0, reserved_uses: 0,
  per_customer_limit: null, min_spend: 0, voucher_type: "percent", discount_value: 10,
};

describe("POST voucher validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects store-only vouchers from the online cart validator", async () => {
    mocks.from.mockImplementation((table: string) => table === "vouchers"
      ? query({ ...voucherBase, redemption_mode: "in_store" })
      : query([]));

    const response = await POST(new Request("http://localhost/api/vouchers/validate", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "SAVE10", cartSubtotal: 100, items: [{ productId: "00000000-0000-4000-8000-000000000001", outletId: "00000000-0000-4000-8000-000000000011", quantity: 1, unitPrice: 100 }] }),
    }));

    expect((await response.json()).data).toMatchObject({ valid: false });
  });

  it("calculates a vendor voucher from only that vendor's verified outlet lines", async () => {
    mocks.from.mockImplementation((table: string) => table === "vouchers"
      ? query(voucherBase)
      : table === "products"
        ? query([
          { id: "00000000-0000-4000-8000-000000000001", vendor_id: "vendor-a", outlet_id: "00000000-0000-4000-8000-000000000011", outlet_offers: [] },
          { id: "00000000-0000-4000-8000-000000000002", vendor_id: "vendor-b", outlet_id: "00000000-0000-4000-8000-000000000022", outlet_offers: [] },
        ])
        : table === "outlets"
          ? query([
            { id: "00000000-0000-4000-8000-000000000011", vendor_id: "vendor-a" },
            { id: "00000000-0000-4000-8000-000000000022", vendor_id: "vendor-b" },
          ])
          : query([]));

    const response = await POST(new Request("http://localhost/api/vouchers/validate", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: "SAVE10", cartSubtotal: 200,
        items: [
          { productId: "00000000-0000-4000-8000-000000000001", outletId: "00000000-0000-4000-8000-000000000011", quantity: 1, unitPrice: 100 },
          { productId: "00000000-0000-4000-8000-000000000002", outletId: "00000000-0000-4000-8000-000000000022", quantity: 1, unitPrice: 100 },
        ],
      }),
    }));

    expect((await response.json()).data).toMatchObject({ valid: true, discountAmount: 10 });
  });
});

describe("voucher view events", () => {
  async function viewAsCustomer(recentView: boolean) {
    const { createClient } = await import("@/lib/supabase/server");
    const insert = vi.fn(async () => ({ error: null }));
    const lookup = vi.fn(async () => ({ data: recentView ? [{ id: "event-1" }] : [], error: null }));
    const events: Record<string, unknown> = { insert };
    for (const method of ["select", "eq", "gte"]) events[method] = vi.fn(() => events);
    events.limit = lookup;
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "customer-a" } } })) },
      from: (table: string) => table === "vouchers" ? query({ ...voucherBase, redemption_mode: "in_store" }) : table === "voucher_events" ? events : query([]),
    } as never);
    await POST(new Request("http://localhost/api/vouchers/validate", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "SAVE10", cartSubtotal: 100, intent: "view", items: [{ productId: "00000000-0000-4000-8000-000000000001", outletId: "00000000-0000-4000-8000-000000000011", quantity: 1, unitPrice: 100 }] }),
    }));
    return { insert, lookup };
  }

  it("records the first view of the day", async () => {
    const { insert } = await viewAsCustomer(false);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ voucher_id: "voucher-a", user_id: "customer-a", event_type: "viewed" }));
  });

  it("skips another view within 24 hours", async () => {
    const { insert, lookup } = await viewAsCustomer(true);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(insert).not.toHaveBeenCalled();
  });
});
