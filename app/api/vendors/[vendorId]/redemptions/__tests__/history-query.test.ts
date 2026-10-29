import { beforeEach, describe, expect, it, vi } from "vitest";

const VENDOR_ID = "22222222-2222-4222-8222-222222222222";
const OUTLET_ID = "33333333-3333-4333-8333-333333333333";
const mocks = vi.hoisted(() => ({ authorizeVendor: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/vendor-authorization", () => ({ authorizeVendor: mocks.authorizeVendor }));

import { GET } from "../route";

describe("Vendor redemption history query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeVendor.mockResolvedValue({
      ok: true,
      access: { vendorId: VENDOR_ID, outletIds: [OUTLET_ID], serviceDb: { rpc: mocks.rpc } },
    });
    mocks.rpc.mockResolvedValue({
      data: { items: [], pagination: { page: 1, pageSize: 15, total: 0, totalPages: 1 }, stats: { totalCount: 0, retailCount: 0 } },
      error: null,
    });
  });

  it("uses the bounded database query with filters and authorized outlet scope", async () => {
    const response = await GET(new Request(`http://localhost/api/vendors/${VENDOR_ID}/redemptions?page=3&pageSize=75&kind=retail_pickup&outletId=${OUTLET_ID}&q=oil`), { params: Promise.resolve({ vendorId: VENDOR_ID }) });
    expect(response.status).toBe(200);
    expect(mocks.authorizeVendor).toHaveBeenCalledWith(VENDOR_ID, undefined, { allowEventVendor: true, requireApproved: true });
    expect(mocks.rpc).toHaveBeenCalledWith("list_vendor_redemption_history", {
      p_vendor_id: VENDOR_ID,
      p_scope_outlet_ids: [OUTLET_ID],
      p_outlet_id: OUTLET_ID,
      p_kind: "retail_pickup",
      p_query: "oil",
      p_page: 3,
      p_page_size: 50,
    });
  });

  it("rejects an outlet outside the authorized vendor scope", async () => {
    const response = await GET(new Request(`http://localhost/api/vendors/${VENDOR_ID}/redemptions?outletId=88888888-8888-4888-8888-888888888888`), { params: Promise.resolve({ vendorId: VENDOR_ID }) });
    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("does not return a successful empty list when history loading fails", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "db unavailable" } });
    const response = await GET(new Request(`http://localhost/api/vendors/${VENDOR_ID}/redemptions`), { params: Promise.resolve({ vendorId: VENDOR_ID }) });
    expect(response.status).toBe(500);
  });
});
