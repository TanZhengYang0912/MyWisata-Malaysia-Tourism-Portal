import { beforeEach, describe, expect, it, vi } from "vitest";
import { CUSTOMER_CAPABILITY } from "@/lib/auth/customer-capabilities";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  resolveCapability: vi.fn(),
  capabilityFailure: vi.fn(),
  getTripById: vi.fn(),
  getTripItems: vi.fn(),
  getCandidates: vi.fn(),
  generateSuggestions: vi.fn(),
  resolveScope: vi.fn(),
}));

vi.mock("@/lib/rate-limit/ai", () => ({ reserveAiQuota: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/checkout/guest-session", () => ({ reserveGuestRateLimit: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/operations/workload", async (original) => ({ ...await original<typeof import("@/lib/operations/workload")>(), withPortalWorkload: vi.fn(async (_scope: string, work: (signal: AbortSignal) => Promise<unknown>) => work(new AbortController().signal)) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/auth/customer-capabilities.server", () => ({
  resolveServerCustomerCapability: mocks.resolveCapability,
  customerCapabilityFailure: mocks.capabilityFailure,
}));
vi.mock("@/backend/domains/trips", () => ({
  getTripById: mocks.getTripById,
  getTripItems: mocks.getTripItems,
}));
vi.mock("@/lib/customer/trip-copilot", () => ({
  getTripCopilotCandidates: mocks.getCandidates,
  generateTripSuggestions: mocks.generateSuggestions,
  resolveTripSuggestionScope: mocks.resolveScope,
  ruleBasedTripSuggestions: (candidates: { productId: string; name: string }[], _weather: unknown, _lang: string, limit: number) => candidates.slice(0, limit).map((item) => ({ productId: item.productId, productName: item.name, message: "Grounded fallback." })),
}));

const { POST } = await import("../route");
const { __resetTripPlanRouteStateForTests } = await import("../route-state");

function request(body: unknown = { tripId: "trip-1", preference: "local food", locale: "en" }) {
  return new Request("http://localhost/api/trips/plan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const candidate = {
  productId: "place-1",
  outletId: "outlet-1",
  name: "Central Market Food Walk",
  category: "Food",
  categorySlug: "food",
  price: 18,
  rating: 4.7,
  reviews: 42,
  description: "Local food tasting.",
  image: "https://example.test/place.jpg",
  requiresBooking: false,
  state: "Kuala Lumpur",
  isHiddenGem: false,
  lat: 3.14,
  lng: 101.69,
  weatherSensitivity: "not_weather_sensitive",
};

describe("POST /api/trips/plan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetTripPlanRouteStateForTests();
    mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser } });
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "alice@example.com" } }, error: null });
    mocks.resolveCapability.mockResolvedValue({ allowed: true, blockerCode: null });
    mocks.capabilityFailure.mockReturnValue(null);
    mocks.getTripById.mockResolvedValue({
      id: "trip-1",
      user_id: "user-1",
      name: "KL weekend",
      start_date: "2026-10-09",
      end_date: "2026-10-11",
    });
    mocks.getTripItems.mockResolvedValue([]);
    mocks.getCandidates.mockResolvedValue([candidate]);
    mocks.resolveScope.mockImplementation((preference: string, tripName: string, selectedState?: string) => {
      const stateNames = ["Penang", "Sabah"].filter((state) => `${preference} ${tripName}`.toLowerCase().includes(state.toLowerCase()));
      if (selectedState) return { state: selectedState, categorySlug: preference.toLowerCase().includes("food") ? "food" : null, ambiguousStates: [] };
      if (stateNames.length > 1) return { state: null, categorySlug: preference.toLowerCase().includes("food") ? "food" : null, ambiguousStates: ["Penang", "Sabah"].filter((state) => stateNames.includes(state)) };
      return { state: stateNames[0] ?? null, categorySlug: preference.toLowerCase().includes("food") ? "food" : null, ambiguousStates: [] };
    });
    mocks.generateSuggestions.mockResolvedValue({
      mode: "llm",
      suggestions: [{ productId: "place-1", productName: candidate.name, message: "A well-rated local food stop." }],
    });
  });

  it("requires authentication before looking up a trip or calling AI", async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: { message: "expired" } });

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(mocks.getTripById).not.toHaveBeenCalled();
    expect(mocks.generateSuggestions).not.toHaveBeenCalled();
  });

  it("enforces the customer's basic AI capability", async () => {
    mocks.capabilityFailure.mockReturnValueOnce(Response.json({ error: "blocked" }, { status: 403 }));

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.resolveCapability).toHaveBeenCalledWith("user-1", CUSTOMER_CAPABILITY.BASIC_AI);
    expect(mocks.getTripById).not.toHaveBeenCalled();
  });

  it("rejects trips owned by another user", async () => {
    mocks.getTripById.mockResolvedValueOnce({ id: "trip-1", user_id: "other-user", name: "Private trip" });

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.getCandidates).not.toHaveBeenCalled();
  });

  it("returns suggestions grounded in actual catalogue candidates and keeps the response private", async () => {
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(mocks.getCandidates).toHaveBeenCalledWith({ state: null, categorySlug: "food", preference: "local food", excludeProductIds: [] }, expect.anything());
    expect(mocks.generateSuggestions).toHaveBeenCalledWith({
      name: "KL weekend",
      startDate: "2026-10-09",
      endDate: "2026-10-11",
    }, [candidate], "en", "local food", { signal: expect.any(AbortSignal) });
    expect(body.data.suggestions).toEqual([{
      productId: "place-1",
      outletId: "outlet-1",
      productName: candidate.name,
      message: "A well-rated local food stop.",
      lat: 3.14,
      lng: 101.69,
      price: 18,
      rating: 4.7,
      image: candidate.image,
      category: "Food",
      categorySlug: "food",
    }]);
    expect(body.data.scope).toEqual({ state: null, categorySlug: "food", ambiguousStates: [] });
    expect(JSON.stringify(body)).not.toContain("alice@example.com");
  });

  it("resolves an explicit batch request to the requested trip day and returns an ordered atomic batch", async () => {
    mocks.resolveScope.mockReturnValueOnce({ state: "Kuala Lumpur", categorySlug: "food", ambiguousStates: [] });
    const response = await POST(request({
      tripId: "trip-1",
      preference: "Add ten food places on day 2",
      locale: "en",
      selectedDate: "2026-10-09",
      travelMode: "DRIVING",
    }));
    const body = await response.json();

    expect(body.data).toMatchObject({
      directAdd: true,
      targetDate: "2026-10-10",
      requestedCount: 10,
      batchOrder: ["product:place-1"],
      routeOrderSource: "approximate",
    });
    expect(mocks.generateSuggestions).toHaveBeenCalledWith(expect.anything(), [candidate], "en", "Add ten food places on day 2", { signal: expect.any(AbortSignal), limit: 10 });
  });

  it("loads one bounded mixed candidate pool and returns grounded partial results", async () => {
    const activity = { ...candidate, productId: "activity-1", name: "Penang Heritage Walk", category: "Attraction", categorySlug: "activity" };
    const food = { ...candidate, productId: "food-1", name: "Penang Noodle Tour", categorySlug: "food" };
    mocks.resolveScope.mockReturnValueOnce({ state: "Penang", categorySlug: null, ambiguousStates: [] });
    mocks.getCandidates.mockResolvedValueOnce([activity, food]);
    mocks.generateSuggestions.mockResolvedValueOnce({
      mode: "llm",
      suggestions: [
        { productId: "activity-1", productName: activity.name, message: "A local heritage walk." },
        { productId: "food-1", productName: food.name, message: "A nearby noodle stop." },
      ],
    });

    const response = await POST(request({
      tripId: "trip-1",
      preference: "第二天安排三个景点，顺便加两家顺路的美食",
      locale: "zh-CN",
      selectedDate: "2026-10-09",
      travelMode: "DRIVING",
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.getCandidates).toHaveBeenCalledTimes(1);
    expect(mocks.getCandidates).toHaveBeenCalledWith(expect.objectContaining({ categorySlugs: ["activity", "food"], limit: 30 }), expect.anything());
    expect(mocks.generateSuggestions).toHaveBeenCalledTimes(1);
    expect(body.data).toMatchObject({
      directAdd: true,
      targetDate: "2026-10-10",
      requestedTotal: 5,
      requestedGroups: [
        { categorySlug: "activity", requestedCount: 3 },
        { categorySlug: "food", requestedCount: 2 },
      ],
      suggestions: [
        { productId: "activity-1", categorySlug: "activity" },
        { productId: "food-1", categorySlug: "food" },
      ],
    });
  });

  it("returns a no-write limit response when a mixed request exceeds ten places", async () => {
    const response = await POST(request({
      tripId: "trip-1",
      preference: "安排六个景点和六家美食",
      locale: "zh-CN",
      selectedDate: "2026-10-09",
    }));
    const body = await response.json();

    expect(body.data).toMatchObject({ mode: "limit-exceeded", directAdd: false, suggestions: [] });
    expect(mocks.getCandidates).not.toHaveBeenCalled();
    expect(mocks.generateSuggestions).not.toHaveBeenCalled();
  });

  it("uses one server-side road-time matrix when the selected day and additions fit the provider limit", async () => {
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "server-test-token");
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ durations: [[0, 180], [240, 0]] }));
    vi.stubGlobal("fetch", fetchMock);
    mocks.resolveScope.mockReturnValueOnce({ state: "Kuala Lumpur", categorySlug: "food", ambiguousStates: [] });
    mocks.getTripItems.mockResolvedValueOnce([{
      id: "stop-1", trip_id: "trip-1", experience_id: "old-place", sequence: 0,
      scheduled_date: "2026-10-10", scheduled_time: "10:00", created_at: "now",
      source: "vendor", lat: 3.15, lng: 101.7, label: "Existing stop",
    }]);

    const response = await POST(request({
      tripId: "trip-1", preference: "Add ten food places on day 2", locale: "en",
      selectedDate: "2026-10-09", travelMode: "DRIVING",
    }));
    const body = await response.json();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/directions-matrix/v1/mapbox/driving/");
    expect(body.data.routeOrderSource).toBe("matrix");
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("strictly validates inputs before searching the catalogue", async () => {
    const response = await POST(request({ tripId: "trip-1", preference: "x".repeat(141), locale: "en", userId: "other" }));

    expect(response.status).toBe(422);
    expect(mocks.getTripById).not.toHaveBeenCalled();
    expect(mocks.getCandidates).not.toHaveBeenCalled();
  });

  it("asks for a state before generating suggestions when the trip names multiple states", async () => {
    mocks.getTripById.mockResolvedValueOnce({
      id: "trip-1", user_id: "user-1", name: "Sabah and Penang food trip", start_date: null, end_date: null,
    });

    const response = await POST(request({ tripId: "trip-1", preference: "", locale: "en" }));
    const body = await response.json();

    expect(body.data).toMatchObject({ mode: "needs-destination", suggestions: [], scope: { ambiguousStates: ["Penang", "Sabah"] } });
    expect(mocks.getCandidates).not.toHaveBeenCalled();
    expect(mocks.generateSuggestions).not.toHaveBeenCalled();
  });

  it("rate-limits repeated AI planning requests per user", async () => {
    for (let index = 0; index < 8; index += 1) expect((await POST(request())).status).toBe(200);

    const response = await POST(request());

    expect(response.status).toBe(429);
    expect(mocks.generateSuggestions).toHaveBeenCalledTimes(8);
  });
});
