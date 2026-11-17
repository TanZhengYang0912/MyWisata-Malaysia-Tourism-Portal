import { beforeEach, describe, expect, it, vi } from "vitest";

const VENDOR_ID = "22222222-2222-4222-8222-222222222222";
const CAMPAIGN_ID = "77777777-7777-4777-8777-777777777777";

const mocks = vi.hoisted(() => ({ authorizeVendor: vi.fn(), calls: [] as Array<[string, unknown[]]> }));
vi.mock("@/lib/vendor-authorization", () => ({ authorizeVendor: mocks.authorizeVendor }));

import { GET } from "../route";

// Records the query chain; resolves to one reservation row.
function chain() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: any = {};
  for (const method of ["from", "select", "eq", "not", "in", "order", "limit", "gte"]) {
    query[method] = (...args: unknown[]) => { mocks.calls.push([method, args]); return query; };
  }
  query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({
    data: [{
      id: "i1", order_id: "o1", event_location_id: "l1", promotion_campaign_locations: { id: "l1", name: "Hall A", campaign_id: CAMPAIGN_ID },
      pickup_date: "2026-11-20", variant_name: null, product_name: "Kaya puff", quantity: 2, line_total: 12, fulfil_status: "pending",
      orders: { display_id: "ORD-1", status: "paid" },
    }],
    error: null,
  }).then(resolve);
  return query;
}

const get = (query = "") => GET(new Request(`http://localhost/x${query}`), { params: Promise.resolve({ vendorId: VENDOR_ID }) });

describe("GET event reservations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.calls.length = 0;
    mocks.authorizeVendor.mockResolvedValue({ ok: true, access: { serviceDb: chain() } });
  });

  it("keeps every location when no event is chosen", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    const select = mocks.calls.find(([method]) => method === "select")?.[1][0] as string;
    expect(select).toContain("promotion_campaign_locations(");
    expect(mocks.calls.some(([method, args]) => method === "eq" && args[0] === "promotion_campaign_locations.campaign_id")).toBe(false);
  });

  it("narrows to one event's locations", async () => {
    const response = await get(`?campaignId=${CAMPAIGN_ID}`);
    expect(response.status).toBe(200);
    const select = mocks.calls.find(([method]) => method === "select")?.[1][0] as string;
    expect(select).toContain("promotion_campaign_locations!inner(");
    expect(mocks.calls).toContainEqual(["eq", ["promotion_campaign_locations.campaign_id", CAMPAIGN_ID]]);
    await expect(response.json()).resolves.toMatchObject({ data: { items: [{ displayId: "ORD-1", locationName: "Hall A", status: "pending" }] } });
  });

  it("rejects a malformed event id before querying", async () => {
    const response = await get("?campaignId=not-a-uuid");
    expect(response.status).toBe(422);
    expect(mocks.calls.some(([method]) => method === "select")).toBe(false);
  });
});
