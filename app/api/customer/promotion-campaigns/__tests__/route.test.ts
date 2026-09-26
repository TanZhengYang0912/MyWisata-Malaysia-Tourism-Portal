import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), rpc: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { GET } from "@/app/api/customer/promotion-campaigns/route";

const campaign = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "real-partner-event",
  title: "Real partner event",
  summary: "A scheduled campaign backed by actual offers.",
  description: "Every offer is resolved against its real approved source.",
  startsAt: "2026-09-25T12:00:00.000Z",
  endsAt: "2026-09-26T12:00:00.000Z",
  visibility: "live",
  offers: [{
    kind: "product",
    id: "22222222-2222-4222-8222-222222222222",
    position: 0,
    vendor: { id: "vendor-a", name: "Vendor A", logoUrl: null },
    outlet: { id: "outlet-a", name: "Outlet A", city: "Penang", state: "Penang", imageUrl: null },
    product: { id: "product-a", name: "A real product", description: null, price: 12, imageUrl: null },
  }],
};

describe("GET /api/customer/promotion-campaigns", () => {
  afterEach(() => vi.unstubAllEnvs());

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: [campaign], error: null });
    mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
  });

  it("reads only the safe projection RPC for guests and returns the linked exact outlet", async () => {
    const response = await GET(new Request("http://localhost/api/customer/promotion-campaigns"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.campaigns).toEqual([campaign]);
    expect(body.data.campaigns[0].offers[0].outlet).toEqual(expect.objectContaining({ id: "outlet-a", name: "Outlet A" }));
    expect(mocks.rpc).toHaveBeenCalledWith("get_public_promotion_campaigns", { p_slug: null });
  });

  it("supports a slug lookup and returns a not-found result for a missing campaign", async () => {
    const detail = await GET(new Request("http://localhost/api/customer/promotion-campaigns?slug=real-partner-event"));
    expect((await detail.json()).data.campaign).toEqual(campaign);
    expect(mocks.rpc).toHaveBeenLastCalledWith("get_public_promotion_campaigns", { p_slug: "real-partner-event" });

    mocks.rpc.mockResolvedValueOnce({ data: [], error: null });
    const missing = await GET(new Request("http://localhost/api/customer/promotion-campaigns?slug=not-live"));
    expect(missing.status).toBe(404);
  });

  it("normalizes legacy product cover paths to public storage URLs", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    mocks.rpc.mockResolvedValueOnce({
      data: [{ ...campaign, offers: [{ ...campaign.offers[0], product: { ...campaign.offers[0].product, imageUrl: "/assets/customer/products/real-product.jpg" } }] }],
      error: null,
    });

    const response = await GET(new Request("http://localhost/api/customer/promotion-campaigns"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.campaigns[0].offers[0].product.imageUrl).toBe("https://project.supabase.co/storage/v1/object/public/product-images/products/real-product.jpg");
  });

  it("rejects malformed slugs without querying the database", async () => {
    const response = await GET(new Request("http://localhost/api/customer/promotion-campaigns?slug=../draft"));
    expect(response.status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("maps database failures to a stable public error without leaking details", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "private table name and stack" } });
    const response = await GET(new Request("http://localhost/api/customer/promotion-campaigns"));
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("private table name");
  });
});
