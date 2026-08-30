import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  userUpdate: vi.fn(),
  userUpdateEq: vi.fn(),
  userSelect: vi.fn(),
  userSelectEq: vi.fn(),
  userSingle: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
    from: () => ({ update: mocks.userUpdate, select: mocks.userSelect }),
  })),
}));

import { PATCH } from "../route";

const cityId = "22222222-2222-4222-8222-222222222222";

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/profile/identity", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/profile/identity canonical location", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "11111111-1111-4111-8111-111111111111" } }, error: null });
    mocks.userUpdate.mockReturnValue({ eq: mocks.userUpdateEq });
    mocks.userUpdateEq.mockResolvedValue({ error: null });
    mocks.userSelect.mockReturnValue({ eq: mocks.userSelectEq });
    mocks.userSelectEq.mockReturnValue({ single: mocks.userSingle });
    mocks.userSingle.mockResolvedValue({ data: { tier: "profile_complete" }, error: null });
    mocks.rpc.mockImplementation(async (name: string) => name === "resolve_profile_location_city"
      ? { data: [{ id: cityId, name: "Kuala Lumpur", country_code: "MY" }], error: null }
      : { data: null, error: null });
  });

  it("resolves canonical strings from the selected internal city", async () => {
    const response = await PATCH(request({
      fullName: "Aina Rahman",
      city: "吉隆坡",
      country: "马来西亚",
      cityId,
      countryCode: "my",
    }));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("resolve_profile_location_city", {
      p_city_id: cityId,
      p_country_code: "MY",
    });
    expect(mocks.userUpdate).toHaveBeenCalledWith(expect.objectContaining({
      full_name: "Aina Rahman",
      city: "Kuala Lumpur",
      country: "Malaysia",
      city_id: cityId,
      country_code: "MY",
      city_source: "catalogue",
    }));
  });

  it("fails closed when the city does not belong to the selected country", async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === "resolve_profile_location_city"
      ? { data: [], error: null }
      : { data: null, error: null });
    const response = await PATCH(request({
      fullName: "Aina Rahman", city: "Kuala Lumpur", country: "China", cityId, countryCode: "CN",
    }));
    expect(response.status).toBe(422);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("preserves manual entry and clears any prior catalogue reference", async () => {
    const response = await PATCH(request({
      fullName: "Aina Rahman", city: "My Small Village", country: "Malaysia", cityId: null, countryCode: "MY",
    }));
    expect(response.status).toBe(200);
    expect(mocks.rpc).not.toHaveBeenCalledWith("resolve_profile_location_city", expect.anything());
    expect(mocks.userUpdate).toHaveBeenCalledWith(expect.objectContaining({
      city: "My Small Village",
      country: "Malaysia",
      city_id: null,
      country_code: "MY",
      city_source: "manual",
    }));
  });

  it("derives the canonical country name for manual city input", async () => {
    const response = await PATCH(request({
      fullName: "Aina Rahman", city: "Johor Bahru", country: "China", cityId: null, countryCode: "MY",
    }));
    expect(response.status).toBe(200);
    expect(mocks.userUpdate).toHaveBeenCalledWith(expect.objectContaining({
      city: "Johor Bahru",
      country: "Malaysia",
      country_code: "MY",
      city_source: "manual",
    }));
  });

  it("rejects unknown ISO-like country codes", async () => {
    const response = await PATCH(request({
      fullName: "Aina Rahman", city: "Somewhere", country: "Somewhere", cityId: null, countryCode: "ZZ",
    }));
    expect(response.status).toBe(422);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("requires countryCode whenever cityId is supplied", async () => {
    const response = await PATCH(request({
      fullName: "Aina Rahman", city: "Kuala Lumpur", country: "Malaysia", cityId,
    }));
    expect(response.status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalledWith("resolve_profile_location_city", expect.anything());
  });

  it("does not expose database error details", async () => {
    mocks.userUpdateEq.mockResolvedValue({ error: { message: "users_city_source_shape violated" } });
    const response = await PATCH(request({
      fullName: "Aina Rahman", city: "Kuala Lumpur", country: "Malaysia", cityId: null, countryCode: "MY",
    }));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("users_city_source_shape");
  });
});
