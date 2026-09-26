import { beforeEach, describe, expect, it, vi } from "vitest";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
const requestedUrls: string[] = [];

vi.mock("@/backend/supabase", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return {
    supabase: createClient("https://orders.test", "test-anon-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: request },
    }),
  };
});

import { getOrdersForUser } from "../commerce";

function orderRow(index: number) {
  return {
    id: `order-${index}`,
    user_id: "customer-1",
    status: "paid",
    subtotal: 10,
    discount_amount: 0,
    total_amount: 10,
    payment_method: "stripe_card",
    voucher_code: null,
    created_at: new Date(Date.UTC(2026, 0, 1) - index * 1000).toISOString(),
    order_items: [],
  };
}

function rangedResponse(rows: unknown[], start: number, end: number, count: number) {
  return new Response(JSON.stringify(rows), {
    headers: {
      "content-type": "application/json",
      "content-range": `${start}-${Math.max(start, start + rows.length - 1)}/${count}`,
    },
  });
}

describe("customer order history pagination", () => {
  beforeEach(() => {
    request.mockReset();
    requestedUrls.length = 0;
  });

  it("loads every RLS-visible order beyond the PostgREST 1,000-row cap", async () => {
    const rows = Array.from({ length: 1236 }, (_, index) => orderRow(index));
    let nextStart = 0;
    request.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const requestInput = input ?? "https://orders.test/rest/v1/orders";
      const requestMessage = new Request(requestInput, init);
      requestedUrls.push(requestMessage.url);
      const start = nextStart;
      const end = start + 999;
      const page = rows.slice(start, end + 1);
      nextStart += page.length;
      return rangedResponse(page, 0, 999, rows.length - start);
    });

    const orders = await getOrdersForUser("customer-1");

    expect(orders).toHaveLength(1236);
    expect(orders.map((order) => order.id)).toContain("order-1235");
    expect(request).toHaveBeenCalledTimes(2);
    const secondRequest = new URL(requestedUrls[1]!);
    expect(secondRequest.searchParams.get("user_id")).toBe("eq.customer-1");
    expect(secondRequest.searchParams.get("or")).toContain("created_at.lt.");
    expect(secondRequest.searchParams.get("or")).toContain("id.lt.order-999");
  });
});
