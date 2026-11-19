import { beforeEach, describe, expect, it, vi } from "vitest";

const { request, schemaLoads } = vi.hoisted(() => ({ request: vi.fn(), schemaLoads: vi.fn() }));

vi.mock("@/backend/supabase", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return {
    supabase: createClient("https://cart.test", "test-anon-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: request },
    }),
  };
});

// Counts when commerce.ts first loads the schema module (zod + libphonenumber-js).
vi.mock("@/lib/validation/schemas", async (importOriginal) => {
  schemaLoads();
  return importOriginal();
});

import { addToCart, updateCartStayDetails } from "../commerce";

let productCategory = "food";

function jsonResponse(body: object) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

describe("stay guest details validation loads on demand", () => {
  beforeEach(() => {
    request.mockReset();
    productCategory = "food";
    request.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const current = input instanceof Request ? input : new Request(input, init);
      const url = new URL(current.url);
      if (url.pathname.endsWith("/carts")) return jsonResponse([{ id: "cart-1" }]);
      if (url.pathname.endsWith("/products")) return jsonResponse([{ id: "product-1", categories: { slug: productCategory } }]);
      if (url.pathname.endsWith("/cart_items") && current.method === "GET") {
        return jsonResponse([{ id: "line-1", variant_id: "variant-1", slot_id: null, outlet_id: "outlet-1", quantity: 1, unit_price: 15, stay_details: null, product_variants: { product_id: "product-1" }, booking_slots: null }]);
      }
      return jsonResponse([]);
    });
  });

  it("does not load the schema module when the line has no stay details", async () => {
    await addToCart("alice", { activityId: "product-1", variantId: "variant-1", outletId: "outlet-1", qty: 1 });
    expect(schemaLoads).not.toHaveBeenCalled();
  });

  it("still rejects invalid stay details before touching the cart", async () => {
    productCategory = "accommodation";
    await expect(addToCart("alice", {
      activityId: "product-1",
      variantId: "variant-1",
      outletId: "outlet-1",
      qty: 1,
      stayDetails: { primaryGuestName: "", adults: 0, estimatedArrival: "unknown" },
    })).rejects.toMatchObject({ name: "ZodError" });
    expect(schemaLoads).toHaveBeenCalledTimes(1);
    expect(request).not.toHaveBeenCalled();
  });

  it("still rejects more guest names than adults when editing a cart line", async () => {
    productCategory = "accommodation";
    await expect(updateCartStayDetails("alice", "line-1", {
      primaryGuestName: "Nur Aisyah",
      additionalGuestNames: ["Sam Lee"],
      adults: 1,
      estimatedArrival: "unknown",
    })).rejects.toMatchObject({ name: "ZodError" });
    expect(request).not.toHaveBeenCalled();
  });
});
