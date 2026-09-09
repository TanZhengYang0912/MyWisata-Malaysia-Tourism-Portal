import { beforeEach, describe, expect, it, vi } from "vitest";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const PLACEMENT_ID = "22222222-2222-4222-8222-222222222222";

const mocks = vi.hoisted(() => ({
  requireStaffPermission: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/staff-permissions/server", () => ({
  requireStaffPermission: mocks.requireStaffPermission,
}));

import { POST } from "@/app/api/admin/sponsored-placements/preview/route";

function request(body: unknown) {
  return new Request("https://mywisata.test/api/admin/sponsored-placements/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const preview = {
  previewVersion: "8d54a9a8c4dd8d27fbb2f6eecdf7d707",
  requestedPosition: 2,
  hasCollision: true,
  shifts: [{
    placementId: PLACEMENT_ID,
    productName: "Rainforest Walk",
    fromPosition: 2,
    toPosition: 3,
  }],
  paused: [],
  archived: [],
  summary: { shiftedCount: 1, pausedCount: 0, archivedCount: 0 },
};

describe("sponsored placement impact preview route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireStaffPermission.mockResolvedValue({
      db: { rpc: mocks.rpc },
      user: { id: "33333333-3333-4333-8333-333333333333" },
      response: null,
    });
    mocks.rpc.mockResolvedValue({ data: preview, error: null });
  });

  it("checks the dedicated permission before reading the body", async () => {
    const forbidden = Response.json({ data: null, error: { code: "FORBIDDEN" } }, { status: 403 });
    mocks.requireStaffPermission.mockResolvedValue({ db: {}, user: null, response: forbidden });
    const json = vi.fn().mockRejectedValue(new Error("must not read body"));

    const response = await POST({ json } as unknown as Request);

    expect(response.status).toBe(403);
    expect(mocks.requireStaffPermission).toHaveBeenCalledWith("admin.map_campaign.manage");
    expect(json).not.toHaveBeenCalled();
  });

  it("previews a create proposal without accepting affected campaign IDs", async () => {
    const response = await POST(request({
      mode: "create",
      productId: PRODUCT_ID,
      startsAt: "2026-10-01T00:00:00.000Z",
      endsAt: "2026-10-31T00:00:00.000Z",
      position: 2,
      allStates: false,
      state: "Sabah",
      allCategories: false,
      categorySlug: "activity",
    }));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("preview_sponsored_discovery_placement", {
      p_placement_id: null,
      p_product_id: PRODUCT_ID,
      p_state: "Sabah",
      p_category_slug: "activity",
      p_starts_at: "2026-10-01T00:00:00.000Z",
      p_ends_at: "2026-10-31T00:00:00.000Z",
      p_priority: 2,
    });
  });

  it("previews approval from the placement ID only", async () => {
    const response = await POST(request({ mode: "approve", placementId: PLACEMENT_ID }));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("preview_sponsored_discovery_placement", {
      p_placement_id: PLACEMENT_ID,
      p_product_id: null,
      p_state: null,
      p_category_slug: null,
      p_starts_at: null,
      p_ends_at: null,
      p_priority: null,
    });
  });

  it.each([0, 5])("rejects invalid Position %s before calling the database", async (position) => {
    const response = await POST(request({
      mode: "create",
      productId: PRODUCT_ID,
      startsAt: "2026-10-01T00:00:00.000Z",
      endsAt: "2026-10-31T00:00:00.000Z",
      position,
      allStates: true,
      allCategories: true,
    }));

    expect(response.status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects browser-supplied impact rows", async () => {
    const response = await POST(request({
      mode: "approve",
      placementId: PLACEMENT_ID,
      affectedIds: [PRODUCT_ID],
    }));

    expect(response.status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects an unexpected database preview shape instead of exposing it", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...preview, reviewNote: "internal" }, error: null });

    const response = await POST(request({ mode: "approve", placementId: PLACEMENT_ID }));

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("internal");
  });
});
