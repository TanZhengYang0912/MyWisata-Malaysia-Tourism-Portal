import { beforeEach, describe, expect, it, vi } from "vitest";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("@/backend/supabase", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return {
    supabase: createClient("https://orders.test", "test-anon-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: request },
    }),
  };
});

import { getOrder } from "../commerce";

function jsonResponse(body: object) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
}

function orderRow(variantName: string | null, slotStartsAt: string | null) {
  return {
    id: "order-1",
    user_id: "customer-1",
    status: "paid",
    subtotal: 30,
    discount_amount: 3,
    total_amount: 27,
    payment_method: "ewallet",
    voucher_code: "MELAKA10",
    created_at: "2026-09-20T14:00:00Z",
    order_items: [{
      product_id: "product-1",
      product_name: "Melaka River Cruise Adult — Non-MyKad",
      image_url: null,
      variant_name: variantName,
      slot_starts_at: slotStartsAt,
      unit_price: 30,
      quantity: 1,
      outlet_id: "outlet-1",
      products: null,
    }],
  };
}

describe("order item variant labels", () => {
  beforeEach(() => request.mockReset());

  it("does not invent a Standard variant for a variant-less booking", async () => {
    request.mockResolvedValue(jsonResponse([orderRow(null, "2026-09-21T01:00:00Z")]));

    const order = await getOrder("order-1");

    expect(order?.items[0]?.variantLabel).toBe("");
  });

  it("keeps the Standard fallback for non-booking order items", async () => {
    request.mockResolvedValue(jsonResponse([orderRow(null, null)]));

    const order = await getOrder("order-1");

    expect(order?.items[0]?.variantLabel).toBe("Standard");
  });
});
