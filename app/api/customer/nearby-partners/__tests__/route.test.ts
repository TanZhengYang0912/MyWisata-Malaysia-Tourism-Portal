import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getNearbyOutlets: vi.fn(),
  cityCentre: vi.fn(),
  getVendorRatingSummaries: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/backend/domains/places", () => ({ getNearbyOutlets: mocks.getNearbyOutlets }));
vi.mock("@/backend/domains/vendor-reviews", () => ({ getVendorRatingSummaries: mocks.getVendorRatingSummaries }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));
vi.mock("@/lib/personalization/location", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/personalization/location")>();
  return { ...actual, cityCentre: mocks.cityCentre };
});

import { POST } from "../route";

function outlet(id: string, vendorId: string, km: number) {
  return {
    outlet: {
      id,
      vendorId,
      vendorName: `Vendor ${vendorId}`,
      name: `Outlet ${id}`,
      coverUrl: `/outlets/${id}.jpg`,
      vendorLogoUrl: `/vendors/${vendorId}.png`,
      city: "George Town",
      state: "Penang",
    },
    km,
  };
}

function configureClient({
  user = null,
  city = null,
  vendors = [],
}: {
  user?: { id: string } | null;
  city?: string | null;
  vendors?: Array<Record<string, unknown>>;
} = {}) {
  const userQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: city ? { city } : null, error: null }),
  };
  const vendorQuery = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve({ data: vendors, error: null }).then(resolve, reject),
  };
  const from = vi.fn((table: string) => table === "users" ? userQuery : vendorQuery);
  mocks.createClient.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from,
  });
  return { from, userQuery, vendorQuery };
}

function request(body: unknown) {
  return new Request("http://localhost/api/customer/nearby-partners", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/customer/nearby-partners", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cityCentre.mockResolvedValue(null);
    mocks.getVendorRatingSummaries.mockResolvedValue(new Map());
  });

  afterEach(() => vi.restoreAllMocks());

  it("ranks distinct approved shop vendors by their nearest outlet and returns at most four", async () => {
    const vendors = ["v1", "v2", "v3", "v4", "v5"].map((id) => ({
      id,
      name: `Vendor ${id}`,
      description: null,
      logo_url: null,
      cover_url: null,
      status: "approved",
      kind: "shop",
    }));
    const { vendorQuery } = configureClient({ vendors });
    mocks.getVendorRatingSummaries.mockResolvedValue(new Map([["v1", { value: 4.5, count: 8 }]]));
    mocks.getNearbyOutlets.mockResolvedValue([
      { ...outlet("o1-near", "v1", 0.5), outlet: { ...outlet("o1-near", "v1", 0.5).outlet, currentlyOpen: true } },
      outlet("o2", "v2", 1.2),
      outlet("o1-far", "v1", 2.4),
      outlet("o3", "v3", 3.1),
      outlet("o4", "v4", 4.5),
      outlet("o5", "v5", 6.7),
    ]);

    const response = await POST(request({ latitude: 5.4141, longitude: 100.3288 }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.getNearbyOutlets).toHaveBeenCalledWith({ lat: 5.4141, lng: 100.3288 }, 20, expect.anything());
    expect(vendorQuery.eq).toHaveBeenCalledWith("status", "approved");
    expect(vendorQuery.eq).toHaveBeenCalledWith("kind", "shop");
    expect(body.data.locationSource).toBe("browser");
    expect(body.data.partners).toHaveLength(4);
    expect(body.data.partners.map((partner: { id: string }) => partner.id)).toEqual(["v1", "v2", "v3", "v4"]);
    expect(body.data.partners[0]).toEqual(expect.objectContaining({
      distanceKm: 0.5,
      rating: { value: 4.5, count: 8 },
      openNow: true,
      outlets: [expect.objectContaining({ id: "o1-near", city: "George Town", state: "Penang" })],
    }));
    expect(body.data.partners[1].rating).toBeNull();
  });

  it("leaves the rating out when the rating lookup fails", async () => {
    configureClient({ vendors: [{ id: "v1", name: "Vendor v1", description: null, logo_url: null, cover_url: null, status: "approved", kind: "shop" }] });
    mocks.getVendorRatingSummaries.mockRejectedValue(new Error("boom"));
    mocks.getNearbyOutlets.mockResolvedValue([outlet("o1", "v1", 0.5)]);

    const body = await (await POST(request({ latitude: 5.4141, longitude: 100.3288 }))).json();

    expect(body.data.partners[0]).not.toHaveProperty("rating");
  });

  it("rejects invalid coordinates before opening a database client", async () => {
    configureClient();

    const response = await POST(request({ latitude: 91, longitude: 100 }));

    expect(response.status).toBe(422);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.getNearbyOutlets).not.toHaveBeenCalled();
  });

  it("falls back to the signed-in user's profile city when no device coordinates are supplied", async () => {
    configureClient({ user: { id: "user-1" }, city: "George Town" });
    mocks.cityCentre.mockResolvedValue({ lat: 5.4141, lng: 100.3288 });
    mocks.getNearbyOutlets.mockResolvedValue([outlet("o1", "v1", 0.5)]);

    const response = await POST(request({}));
    const body = await response.json();

    expect(mocks.cityCentre).toHaveBeenCalledWith("George Town");
    expect(mocks.getNearbyOutlets).toHaveBeenCalledWith({ lat: 5.4141, lng: 100.3288 }, 20, expect.anything());
    expect(body.data.locationSource).toBe("city");
  });

  it("returns an empty result for guests without an explicitly shared location", async () => {
    configureClient();

    const response = await POST(request({}));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ locationSource: "none", partners: [] });
    expect(mocks.cityCentre).not.toHaveBeenCalled();
    expect(mocks.getNearbyOutlets).not.toHaveBeenCalled();
  });
});
