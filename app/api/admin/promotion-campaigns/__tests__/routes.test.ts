import { beforeEach, describe, expect, it, vi } from "vitest";

const CAMPAIGN_ID = "11111111-1111-4111-8111-111111111111";
const VOUCHER_ID = "22222222-2222-4222-8222-222222222222";
const PRODUCT_ID = "33333333-3333-4333-8333-333333333333";
const OUTLET_ID = "44444444-4444-4444-8444-444444444444";
const UPDATED_AT = "2026-09-25T12:00:00.000Z";

const mocks = vi.hoisted(() => ({ requireStaffPermission: vi.fn(), rpc: vi.fn(), from: vi.fn(), tables: {} as Record<string, ReturnType<typeof query>> }));

function query(result: unknown) {
  const terminal = Promise.resolve(result);
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "eq", "in", "order"]) builder[method] = vi.fn(() => builder);
  builder.then = terminal.then.bind(terminal) as ReturnType<typeof vi.fn>;
  return builder;
}

vi.mock("@/lib/staff-permissions/server", () => ({ requireStaffPermission: mocks.requireStaffPermission }));

import * as collectionRoute from "@/app/api/admin/promotion-campaigns/route";
import * as itemRoute from "@/app/api/admin/promotion-campaigns/[id]/route";

const validCampaign = {
  title: "Double Eleven experiences",
  slug: "double-eleven-experiences",
  summary: "A limited seasonal collection of real partner offers.",
  description: "Browse selected partner vouchers and outlet-specific products during this scheduled campaign.",
  startsAt: "2026-11-10T16:00:00.000Z",
  endsAt: "2026-11-11T16:00:00.000Z",
  offers: [
    { kind: "voucher", voucherId: VOUCHER_ID, position: 0 },
    { kind: "product", productId: PRODUCT_ID, outletId: OUTLET_ID, position: 1 },
  ],
};

function request(method: string, body?: unknown) {
  return new Request("http://localhost/api/admin/promotion-campaigns", {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("Admin promotion campaign APIs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tables = {
      promotion_campaigns: query({ data: [{ id: CAMPAIGN_ID, slug: "seasonal-campaign", title: "Seasonal campaign", status: "draft", updated_at: UPDATED_AT }], error: null }),
      promotion_campaign_offers: query({ data: [{ id: "55555555-5555-4555-8555-555555555555", campaign_id: CAMPAIGN_ID, voucher_id: VOUCHER_ID, product_id: null, outlet_id: null, position: 0 }], error: null }),
    };
    mocks.from.mockImplementation((table: string) => mocks.tables[table]);
    mocks.rpc.mockResolvedValue({ data: { id: CAMPAIGN_ID, status: "draft", updated_at: UPDATED_AT }, error: null });
    mocks.requireStaffPermission.mockResolvedValue({ db: { rpc: mocks.rpc, from: mocks.from }, user: { id: "staff-owner" }, response: null });
  });

  it("checks the dedicated permission before reading a request body or campaign table", async () => {
    const forbidden = Response.json({ data: null, error: { code: "FORBIDDEN" } }, { status: 403 });
    mocks.requireStaffPermission.mockResolvedValue({ db: {}, user: null, response: forbidden });
    const json = vi.fn().mockRejectedValue(new Error("body must not be read"));

    const response = await collectionRoute.POST({ json } as unknown as Request);
    expect(response.status).toBe(403);
    expect(mocks.requireStaffPermission).toHaveBeenCalledWith("admin.promotion_campaign.manage");
    expect(json).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("lists campaign rows and real eligible offer choices through the guarded source RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: { products: [{ productId: PRODUCT_ID, outletId: OUTLET_ID }], vouchers: [{ voucherId: VOUCHER_ID }] }, error: null });

    const response = await collectionRoute.GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.campaigns[0]).toMatchObject({ id: CAMPAIGN_ID, status: "draft", offers: [{ voucher_id: VOUCHER_ID }] });
    expect(body.data.sources).toEqual({ products: [{ productId: PRODUCT_ID, outletId: OUTLET_ID }], vouchers: [{ voucherId: VOUCHER_ID }] });
    expect(mocks.requireStaffPermission).toHaveBeenCalledWith("admin.promotion_campaign.manage");
    expect(mocks.rpc).toHaveBeenCalledWith("get_admin_promotion_campaign_sources");
  });

  it("validates campaign drafts and persists only through the database RPC", async () => {
    const response = await collectionRoute.POST(request("POST", validCampaign));

    expect(response.status).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledWith("save_promotion_campaign_draft", {
      p_campaign_id: null,
      p_expected_updated_at: null,
      p_title: validCampaign.title,
      p_slug: validCampaign.slug,
      p_summary: validCampaign.summary,
      p_description: validCampaign.description,
      p_starts_at: validCampaign.startsAt,
      p_ends_at: validCampaign.endsAt,
      p_offers: validCampaign.offers,
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("rejects unknown fields and invalid dates before any database write", async () => {
    expect((await collectionRoute.POST(request("POST", { ...validCampaign, fakeDiscount: 99 }))).status).toBe(422);
    expect((await collectionRoute.POST(request("POST", { ...validCampaign, endsAt: validCampaign.startsAt }))).status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("updates drafts with an optimistic timestamp and transitions through guarded RPCs", async () => {
    const save = await itemRoute.PATCH(request("PATCH", {
      action: "save_draft",
      campaign: { ...validCampaign, expectedUpdatedAt: UPDATED_AT },
    }), { params: Promise.resolve({ id: CAMPAIGN_ID }) });
    expect(save.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("save_promotion_campaign_draft", expect.objectContaining({
      p_campaign_id: CAMPAIGN_ID,
      p_expected_updated_at: UPDATED_AT,
    }));

    mocks.rpc.mockResolvedValueOnce({ data: { id: CAMPAIGN_ID, status: "pending_approval" }, error: null });
    const submit = await itemRoute.PATCH(request("PATCH", { action: "submit", expectedUpdatedAt: UPDATED_AT }), { params: Promise.resolve({ id: CAMPAIGN_ID }) });
    expect(submit.status).toBe(200);
    expect(mocks.rpc).toHaveBeenLastCalledWith("transition_promotion_campaign", {
      p_campaign_id: CAMPAIGN_ID,
      p_action: "submit",
      p_expected_updated_at: UPDATED_AT,
      p_note: null,
    });
  });

  it("requires a rejection reason and never exposes database error details", async () => {
    const invalid = await itemRoute.PATCH(request("PATCH", { action: "reject", expectedUpdatedAt: UPDATED_AT }), { params: Promise.resolve({ id: CAMPAIGN_ID }) });
    expect(invalid.status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();

    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "promotion_campaign_creator_cannot_approve internal detail" } });
    const rejected = await itemRoute.PATCH(request("PATCH", { action: "approve", expectedUpdatedAt: UPDATED_AT }), { params: Promise.resolve({ id: CAMPAIGN_ID }) });
    expect(rejected.status).toBe(403);
    expect(JSON.stringify(await rejected.json())).not.toContain("internal detail");
  });

  it("returns stable unavailable errors instead of raw database messages", async () => {
    mocks.tables.promotion_campaigns = query({ data: null, error: { message: "secret database detail" } });
    const response = await collectionRoute.GET();
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("secret database detail");
  });
});
