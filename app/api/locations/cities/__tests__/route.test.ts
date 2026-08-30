import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
  })),
}));

import { GET } from "../route";

function request(query = "Kuala", country = "MY") {
  return new Request(`http://localhost/api/locations/cities?q=${encodeURIComponent(query)}&country=${encodeURIComponent(country)}`);
}

describe("GET /api/locations/cities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "11111111-1111-4111-8111-111111111111" } }, error: null });
    mocks.rpc.mockResolvedValue({
      data: [{ id: "22222222-2222-4222-8222-222222222222", name: "Kuala Lumpur", admin1_code: "14", country_code: "MY", latitude: 3.14 }],
      error: null,
    });
  });

  it("requires authentication before searching", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["K", "MY"],
    ["Kuala", "MYS"],
    ["Kuala", "1Y"],
    ["Kuala", "ZZ"],
    ["%%", "MY"],
  ])("rejects invalid query/country values", async (query, country) => {
    const response = await GET(request(query, country));
    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("uses a bounded country-scoped RPC and projects only safe fields", async () => {
    const response = await GET(request(" 吉隆坡 ", "my"));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("search_location_cities", {
      p_country_code: "MY",
      p_query: "吉隆坡",
      p_limit: 5,
    });
    await expect(response.json()).resolves.toEqual({
      data: [{ id: "22222222-2222-4222-8222-222222222222", name: "Kuala Lumpur", admin1Code: "14", countryCode: "MY" }],
    });
  });

  it("returns a safe service error without exposing database details", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "relation public.location_cities does not exist" } });
    const response = await GET(request());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "City suggestions are unavailable" });
  });
});
