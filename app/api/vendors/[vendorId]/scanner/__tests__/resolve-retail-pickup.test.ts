import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signRetailPickupToken } from "@/lib/orders/retail-pickup-token";

const vendorId = "bbbbbbbb-2222-accc-3ddd-000000000003";
const outletId = "cccccccc-dddd-aeee-3fff-111111111111";
const orderId = "20000000-0000-4000-8000-000000000001";
const orderItemId = "20000000-0000-4000-8000-000000000002";
const secret = "retail-pickup-resolve-test-secret";
const mocks = vi.hoisted(() => ({ authorizeVendor: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/vendor-authorization", () => ({ authorizeVendor: mocks.authorizeVendor }));

import { POST } from "../resolve/route";

const item = {
  id: orderItemId, order_id: orderId, vendor_id: vendorId, outlet_id: outletId,
  product_name: "Soy sauce", variant_name: "500 ml", quantity: 3,
  fulfil_status: "pending", retail_qr_scanned_at: null,
  event_location_id: null, event_listing_id: null, slot_starts_at: null,
  products: { requires_booking: false, product_type: "product", categories: { slug: "retail" } },
  orders: { status: "paid" },
};

function query(data: unknown) {
  const result = Promise.resolve({ data, error: null });
  const builder: Record<string, unknown> = {};
  for (const key of ["select", "eq"]) builder[key] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(() => result);
  builder.then = result.then.bind(result);
  return builder;
}

function retailUrl(token: string) {
  return `http://localhost/customer/orders/${orderId}?retail_t=${token}`;
}

async function resolve(rawValue: string, selectedOutlet = outletId) {
  return POST(new Request(`http://localhost/api/vendors/${vendorId}/scanner/resolve`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ rawValue, outletId: selectedOutlet }),
  }), { params: Promise.resolve({ vendorId }) });
}

describe("retail pickup scanner preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("RETAIL_PICKUP_QR_SECRET", secret);
    mocks.from.mockImplementation((table: string) => {
      if (table === "vendors") return query({ id: vendorId, name: "Grocery Vendor", status: "approved", kind: "standard" });
      if (table === "outlets") return query({ id: outletId, name: "Central Shop", status: "active", vendor_id: vendorId });
      if (table === "order_items") return query(item);
      if (table === "refunds") return query([]);
      return query(null);
    });
    mocks.authorizeVendor.mockResolvedValue({ ok: true, access: { outletIds: [outletId], serviceDb: { from: mocks.from } } });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("shows the exact paid retail order line without redeeming it", async () => {
    const token = signRetailPickupToken({ orderId, orderItemId, vendorId, outletId, issuedAt: Math.floor(Date.now() / 1000) }, secret);
    const response = await resolve(retailUrl(token));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: {
      kind: "retail_pickup", orderId, orderItemId, vendorId, outletId,
      vendorName: "Grocery Vendor", outletName: "Central Shop", quantity: 3,
    } });
    expect(mocks.from.mock.calls.map(([table]) => table)).not.toContain("audit_logs");
  });

  it("rejects a token at a different outlet before reading the order line", async () => {
    const otherOutlet = "20000000-0000-4000-8000-000000000006";
    const token = signRetailPickupToken({ orderId, orderItemId, vendorId, outletId: otherOutlet, issuedAt: Math.floor(Date.now() / 1000) }, secret);
    const response = await resolve(retailUrl(token));

    expect(response.status).toBe(403);
    expect(mocks.from.mock.calls.map(([table]) => table)).toEqual(["vendors"]);
  });
});
