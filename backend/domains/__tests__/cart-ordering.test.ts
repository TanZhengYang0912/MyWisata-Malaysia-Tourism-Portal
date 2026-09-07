import { beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("@/backend/supabase", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return {
    supabase: createClient("https://cart.test", "test-anon-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: request },
    }),
  };
});

import { addToCart, getCart, updateCartQty } from "../commerce";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260905062500_cart_last_added_order.sql",
);

let persistedRows: object[];

function jsonResponse(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function cartRow(quantity = 1, id = "line-1") {
  return {
    id,
    variant_id: "variant-1",
    slot_id: null,
    outlet_id: "outlet-1",
    quantity,
    unit_price: 15,
    product_variants: { product_id: "product-1" },
    booking_slots: null,
  };
}

async function asRequest(input: RequestInfo | URL, init?: RequestInit) {
  return input instanceof Request ? input : new Request(input, init);
}

describe("cart recency ordering", () => {
  beforeEach(() => {
    request.mockReset();
    persistedRows = [cartRow()];
    request.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const current = await asRequest(input, init);
      const url = new URL(current.url);
      if (url.pathname.endsWith("/carts")) return jsonResponse([{ id: "cart-1" }]);
      if (current.method === "GET" && url.pathname.endsWith("/cart_items")) {
        return jsonResponse(persistedRows);
      }
      return jsonResponse([]);
    });
  });

  it("requests cart lines from the most recently added to the oldest", async () => {
    await getCart("alice");

    const cartItemsRequest = request.mock.calls
      .map(([input, init]) => input instanceof Request ? input : new Request(input, init))
      .find((current) => current.method === "GET" && new URL(current.url).pathname.endsWith("/cart_items"));

    expect(new URL(cartItemsRequest!.url).searchParams.get("order"))
      .toBe("last_added_at.desc,created_at.desc,id.desc");
  });

  it("refreshes recency when an existing line is explicitly added again", async () => {
    await addToCart("alice", {
      activityId: "product-1",
      variantId: "variant-1",
      outletId: "outlet-1",
      qty: 2,
    });

    const updateRequest = request.mock.calls
      .map(([input, init]) => input instanceof Request ? input : new Request(input, init))
      .find((current) => current.method === "PATCH" && new URL(current.url).pathname.endsWith("/cart_items"));
    const body = JSON.parse(await updateRequest!.clone().text());

    expect(body.quantity).toBe(3);
    expect(body.last_added_at).toEqual(expect.any(String));
  });

  it("does not move a line when its quantity is changed from the cart", async () => {
    await updateCartQty("alice", 0, 4);

    const updateRequest = request.mock.calls
      .map(([input, init]) => input instanceof Request ? input : new Request(input, init))
      .find((current) => current.method === "PATCH" && new URL(current.url).pathname.endsWith("/cart_items"));
    const body = JSON.parse(await updateRequest!.clone().text());

    expect(body).toEqual({ quantity: 4 });
  });

  it("keeps visible indexes aligned when a legacy cart row has no backing product", async () => {
    persistedRows = [
      {
        ...cartRow(1, "orphan-line"),
        variant_id: null,
        product_variants: null,
      },
      cartRow(1, "visible-line"),
    ];

    await updateCartQty("alice", 0, 4);

    const updateRequest = request.mock.calls
      .map(([input, init]) => input instanceof Request ? input : new Request(input, init))
      .find((current) => current.method === "PATCH" && new URL(current.url).pathname.endsWith("/cart_items"));

    expect(new URL(updateRequest!.url).searchParams.get("id")).toBe("eq.visible-line");
  });
});

describe("cart recency migration", () => {
  it("backfills existing rows and adds a deterministic cart ordering index", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toMatch(/add column last_added_at timestamptz/i);
    expect(migration).toMatch(/set last_added_at = created_at/i);
    expect(migration).toMatch(/alter column last_added_at set not null/i);
    expect(migration).toMatch(/cart_id, last_added_at desc, created_at desc, id desc/i);
    expect(migration).not.toMatch(/delete\s+from\s+cart_items/i);
  });
});
