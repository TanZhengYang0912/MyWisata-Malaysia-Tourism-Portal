import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  createServiceClient: vi.fn(),
  getPlaceCommentsPage: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: mocks.createServiceClient }));
vi.mock("@/backend/domains/place-comments", async () => {
  const actual = await vi.importActual<typeof import("@/backend/domains/place-comments")>("@/backend/domains/place-comments");
  return { ...actual, getPlaceCommentsPage: mocks.getPlaceCommentsPage };
});

const { DELETE, GET, POST } = await import("../route");
const placeId = "11111111-1111-4111-8111-111111111111";
const routeSource = readFileSync(resolve(process.cwd(), "app/api/places/[placeId]/comments/route.ts"), "utf8");

function activePlaceService() {
  return {
    from: vi.fn(() => {
      const query = {
        eq: vi.fn(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { id: placeId }, error: null }),
      };
      query.eq.mockReturnValue(query);
      return { select: vi.fn(() => query) };
    }),
  };
}

describe("place comments API contract", () => {
  beforeEach(() => {
    mocks.getUser.mockReset().mockResolvedValue({ data: { user: null }, error: null });
    mocks.createServiceClient.mockReset().mockReturnValue(activePlaceService());
    mocks.getPlaceCommentsPage.mockReset().mockResolvedValue({ items: [], total: 0 });
  });

  it("allows anonymous reads of published local notes", async () => {
    const response = await GET(new Request(`http://localhost/api/places/${placeId}/comments`), { params: Promise.resolve({ placeId }) });

    expect(response.status).toBe(200);
    expect(mocks.getPlaceCommentsPage).toHaveBeenCalledWith(placeId, expect.objectContaining({ page: 1, pageSize: 6, viewerId: undefined }), expect.anything());
  });

  it("requires a signed-in user before a note can be created or deleted", async () => {
    const create = await POST(new Request(`http://localhost/api/places/${placeId}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "Bring water and take the shaded path after noon." }),
    }), { params: Promise.resolve({ placeId }) });
    const remove = await DELETE(new Request(`http://localhost/api/places/${placeId}/comments`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ commentId: "22222222-2222-4222-8222-222222222222" }),
    }), { params: Promise.resolve({ placeId }) });

    expect(create.status).toBe(401);
    expect(remove.status).toBe(401);
  });

  it("limits server-side deletion to the current author", () => {
    expect(routeSource).toContain('.eq("user_id", user.id)');
    expect(routeSource).toContain('.eq("place_id", placeId)');
  });

  it("stores is_anonymous and selects rich author fields", () => {
    expect(routeSource).toContain("is_anonymous: parsed.data.isAnonymous");
    expect(routeSource).toContain('.select("full_name,display_name,avatar_url,city")');
  });
});
