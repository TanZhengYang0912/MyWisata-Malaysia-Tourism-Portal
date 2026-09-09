import { beforeEach, describe, expect, it, vi } from "vitest";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const PLACEMENT_ID = "22222222-2222-4222-8222-222222222222";

const mocks = vi.hoisted(() => ({
  requireStaffPermission: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/staff-permissions/server", () => ({
  requireStaffPermission: mocks.requireStaffPermission,
}));

import * as collectionRoute from "@/app/api/admin/sponsored-placements/route";
import * as itemRoute from "@/app/api/admin/sponsored-placements/[id]/route";

function request(method: string, body: unknown) {
  return new Request("https://mywisata.test/api/admin/sponsored-placements", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("admin sponsored placement routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireStaffPermission.mockResolvedValue({
      db: { rpc: mocks.rpc, from: mocks.from },
      user: { id: "33333333-3333-4333-8333-333333333333" },
      response: null,
    });
  });

  it("checks the dedicated permission before reading a create body", async () => {
    const forbidden = Response.json({ data: null, error: { code: "FORBIDDEN" } }, { status: 403 });
    mocks.requireStaffPermission.mockResolvedValue({ db: {}, user: null, response: forbidden });
    const json = vi.fn().mockRejectedValue(new Error("body must not be read"));

    const response = await collectionRoute.POST({ json } as unknown as Request);

    expect(response.status).toBe(403);
    expect(mocks.requireStaffPermission).toHaveBeenCalledWith("admin.map_campaign.manage");
    expect(json).not.toHaveBeenCalled();
  });

  it("guards the list and returns only explicit safe placement and eligible product fields", async () => {
    const placementOrder = vi.fn().mockResolvedValue({
      data: [
        { id: PLACEMENT_ID, status: "approved" },
        { id: "44444444-4444-4444-8444-444444444444", status: "archived" },
      ],
      error: null,
    });
    const placementSelect = vi.fn().mockReturnValue({ order: placementOrder });
    const productOrder = vi.fn().mockResolvedValue({ data: [{ id: PRODUCT_ID, name: "Rainforest Walk" }], error: null });
    const productQuery = { eq: vi.fn(), order: productOrder };
    productQuery.eq.mockReturnValue(productQuery);
    const productSelect = vi.fn().mockReturnValue(productQuery);
    mocks.from.mockImplementation((table: string) => table === "products" ? { select: productSelect } : { select: placementSelect });

    const response = await collectionRoute.GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.requireStaffPermission).toHaveBeenCalledWith("admin.map_campaign.manage");
    expect(placementSelect.mock.calls[0][0]).not.toContain("*");
    expect(productSelect).toHaveBeenCalledWith("id,name");
    expect(productQuery.eq).toHaveBeenCalledWith("status", "active");
    expect(productQuery.eq).toHaveBeenCalledWith("review_status", "approved");
    expect(payload.data.products).toEqual([{ id: PRODUCT_ID, name: "Rainforest Walk" }]);
    expect(payload.data.placements).toEqual([{ id: PLACEMENT_ID, status: "approved" }]);
    expect(payload.data.archivedPlacements).toEqual([
      { id: "44444444-4444-4444-8444-444444444444", status: "archived" },
    ]);
  });

  it("creates a scoped draft through the governed RPC", async () => {
    mocks.rpc.mockResolvedValue({
      data: { id: PLACEMENT_ID, product_id: PRODUCT_ID, status: "draft" },
      error: null,
    });

    const response = await collectionRoute.POST(request("POST", {
      productId: PRODUCT_ID,
      startsAt: "2026-10-01T00:00:00.000Z",
      endsAt: "2026-10-31T00:00:00.000Z",
      position: 2,
      previewVersion: "8d54a9a8c4dd8d27fbb2f6eecdf7d707",
      allStates: false,
      state: "Sabah",
      allCategories: false,
      categorySlug: "activity",
    }));

    expect(response.status).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledWith("create_sponsored_discovery_placement", {
      p_product_id: PRODUCT_ID,
      p_state: "Sabah",
      p_category_slug: "activity",
      p_starts_at: "2026-10-01T00:00:00.000Z",
      p_ends_at: "2026-10-31T00:00:00.000Z",
      p_priority: 2,
      p_preview_version: "8d54a9a8c4dd8d27fbb2f6eecdf7d707",
    });
  });

  it("rejects invalid dates and unknown fields without calling the database", async () => {
    const response = await collectionRoute.POST(request("POST", {
      productId: PRODUCT_ID,
      startsAt: "2026-10-31T00:00:00.000Z",
      endsAt: "2026-10-01T00:00:00.000Z",
      position: 2,
      previewVersion: "8d54a9a8c4dd8d27fbb2f6eecdf7d707",
      allStates: true,
      allCategories: true,
      metadata: { tracking: "not allowed" },
    }));

    expect(response.status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("maps inactive or unapproved product rejection to a conflict", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "sponsored_product_not_eligible" } });

    const response = await collectionRoute.POST(request("POST", {
      productId: PRODUCT_ID,
      startsAt: "2026-10-01T00:00:00.000Z",
      endsAt: "2026-10-31T00:00:00.000Z",
      position: 2,
      previewVersion: "8d54a9a8c4dd8d27fbb2f6eecdf7d707",
      allStates: true,
      allCategories: true,
    }));

    expect(response.status).toBe(409);
  });

  it.each(["submit", "approve", "pause"] as const)("performs the %s transition through the workflow RPC", async (action) => {
    mocks.rpc.mockResolvedValue({ data: { id: PLACEMENT_ID, status: action === "submit" ? "pending_approval" : action === "approve" ? "approved" : "paused" }, error: null });

    const response = await itemRoute.PATCH(request("PATCH", {
      action,
      ...(action === "approve" ? { previewVersion: "8d54a9a8c4dd8d27fbb2f6eecdf7d707" } : {}),
    }), {
      params: Promise.resolve({ id: PLACEMENT_ID }),
    });

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("transition_sponsored_discovery_placement", {
      p_placement_id: PLACEMENT_ID,
      p_action: action,
      p_note: null,
      p_preview_version: action === "approve" ? "8d54a9a8c4dd8d27fbb2f6eecdf7d707" : null,
    });
  });

  it("requires a bounded reason for rejection", async () => {
    const response = await itemRoute.PATCH(request("PATCH", { action: "reject" }), {
      params: Promise.resolve({ id: PLACEMENT_ID }),
    });

    expect(response.status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("maps creator self-approval denial without leaking database details", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "sponsored_creator_self_approval_denied internal row" } });

    const response = await itemRoute.PATCH(request("PATCH", {
      action: "approve",
      previewVersion: "8d54a9a8c4dd8d27fbb2f6eecdf7d707",
    }), {
      params: Promise.resolve({ id: PLACEMENT_ID }),
    });
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error.message).toBe("Campaign creators cannot approve their own placement");
    expect(JSON.stringify(payload)).not.toContain("internal row");
  });

  it("requires a preview token for approval", async () => {
    const response = await itemRoute.PATCH(request("PATCH", { action: "approve" }), {
      params: Promise.resolve({ id: PLACEMENT_ID }),
    });

    expect(response.status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("maps a stale approval preview to a review-again conflict", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "sponsored_preview_stale internal" } });

    const response = await itemRoute.PATCH(request("PATCH", {
      action: "approve",
      previewVersion: "8d54a9a8c4dd8d27fbb2f6eecdf7d707",
    }), {
      params: Promise.resolve({ id: PLACEMENT_ID }),
    });
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error.code).toBe("SPONSORED_PREVIEW_STALE");
    expect(JSON.stringify(payload)).not.toContain("internal");
  });
});
