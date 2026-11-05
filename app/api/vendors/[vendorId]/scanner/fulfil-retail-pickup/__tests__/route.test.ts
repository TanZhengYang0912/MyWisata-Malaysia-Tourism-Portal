import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signRetailPickupToken } from "@/lib/orders/retail-pickup-token";

const vendorId = "bbbbbbbb-2222-accc-3ddd-000000000003";
const outletId = "cccccccc-dddd-aeee-3fff-111111111111";
const orderId = "10000000-0000-4000-8000-000000000001";
const orderItemId = "10000000-0000-4000-8000-000000000002";
const operatorId = "10000000-0000-4000-8000-000000000005";
const secret = "retail-pickup-route-test-secret-with-adequate-length";
const mocks = vi.hoisted(() => ({ authorizeVendor: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/vendor-authorization", () => ({ authorizeVendor: mocks.authorizeVendor }));

import { POST } from "../route";

function query(data: unknown) {
  const result = Promise.resolve({ data, error: null });
  const builder: Record<string, unknown> = {};
  for (const key of ["select", "eq"]) builder[key] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(() => result);
  builder.then = result.then.bind(result);
  return builder;
}

function signedToken() {
  return signRetailPickupToken({ orderId, orderItemId, vendorId, outletId, issuedAt: Math.floor(Date.now() / 1000) }, secret);
}

async function submit(token: string, selectedOutlet = outletId) {
  return POST(new Request(`http://localhost/api/vendors/${vendorId}/scanner/fulfil-retail-pickup`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ retailToken: token, outletId: selectedOutlet }),
  }), { params: Promise.resolve({ vendorId }) });
}

describe("retail pickup confirmation endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("RETAIL_PICKUP_QR_SECRET", secret);
    mocks.from.mockImplementation((table: string) => table === "vendors"
      ? query({ status: "approved" })
      : query({ status: "active", vendor_id: vendorId }));
    mocks.rpc.mockResolvedValue({ data: { status: "fulfilled", orderItemId, quantity: 3 }, error: null });
    mocks.authorizeVendor.mockResolvedValue({ ok: true, access: {
      userId: operatorId, outletIds: [outletId], serviceDb: { from: mocks.from, rpc: mocks.rpc },
    } });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("confirms the exact order line through the atomic database RPC", async () => {
    const response = await submit(signedToken());

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("fulfil_retail_pickup", {
      p_order_id: orderId, p_order_item_id: orderItemId, p_vendor_id: vendorId,
      p_outlet_id: outletId, p_operator_id: operatorId,
    });
  });

  it("rejects a QR at an unassigned outlet before calling the database", async () => {
    const otherOutlet = "10000000-0000-4000-8000-000000000006";
    const response = await submit(signedToken(), otherOutlet);

    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("maps a duplicate collection to a conflict", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "retail_pickup_already_fulfilled" } });
    const response = await submit(signedToken());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "RETAIL_PICKUP_COLLECTED" } });
  });
});
