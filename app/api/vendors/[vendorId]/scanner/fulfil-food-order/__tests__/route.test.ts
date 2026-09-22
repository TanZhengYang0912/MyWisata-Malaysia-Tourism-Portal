import { beforeEach, describe, expect, it, vi } from "vitest";
import { signFoodFulfilmentToken } from "@/lib/food/food-fulfilment-token";

const ids = {
  vendor: "11111111-1111-4111-8111-111111111111",
  outlet: "22222222-2222-4222-8222-222222222222",
  order: "44444444-4444-4444-8444-444444444444",
};
const mocks = vi.hoisted(() => ({ authorizeVendor: vi.fn(), from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/vendor-authorization", () => ({ authorizeVendor: mocks.authorizeVendor }));

import { POST } from "../route";

function query(data: unknown) {
  const result = Promise.resolve({ data, error: null });
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq"]) builder[method] = vi.fn(() => builder);
  builder.then = result.then.bind(result);
  return builder;
}

describe("vendor food order fulfilment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeVendor.mockResolvedValue({
      ok: true,
      access: { userId: "operator-1", outletIds: [ids.outlet], serviceDb: { from: mocks.from, rpc: mocks.rpc } },
    });
    mocks.from.mockReturnValue(query([{
      id: "item-1",
      food_fulfilment_mode: "takeaway",
      fulfil_status: "pending",
      products: { categories: { slug: "food" } },
    }]));
    mocks.rpc.mockResolvedValue({ data: { success: true, mode: "takeaway", status: "fulfilled", items_scanned: 1 }, error: null });
  });

  it("uses the atomic database fulfilment function after validating token and outlet", async () => {
    const foodToken = signFoodFulfilmentToken({ orderId: ids.order, outletId: ids.outlet, issuedAt: Date.now() });
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ outletId: ids.outlet, foodToken }),
    }), { params: Promise.resolve({ vendorId: ids.vendor }) });
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ mode: "takeaway", status: "fulfilled" });
    expect(mocks.rpc).toHaveBeenCalledWith("fulfil_food_order_group", {
      p_order_id: ids.order,
      p_outlet_id: ids.outlet,
      p_vendor_id: ids.vendor,
      p_operator_id: "operator-1",
    });
  });

  it("rejects replays reported by the atomic database function", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "food_order_already_fulfilled" } });
    const foodToken = signFoodFulfilmentToken({ orderId: ids.order, outletId: ids.outlet, issuedAt: Date.now() });
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ outletId: ids.outlet, foodToken }),
    }), { params: Promise.resolve({ vendorId: ids.vendor }) });
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("FOOD_ORDER_FULFILLED");
  });
});
