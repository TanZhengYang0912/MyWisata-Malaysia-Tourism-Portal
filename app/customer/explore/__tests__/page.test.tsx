import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActivities: vi.fn(),
  getStates: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/cache/catalogue-cache", () => ({ getCachedComputedActivities: mocks.getActivities }));
vi.mock("@/backend/domains/places", () => ({ getStatesWithPlaces: mocks.getStates }));
vi.mock("../explore-client", () => ({ ExploreClient: () => null }));

import ExplorePage from "../page";

function upstreamError(status: number) {
  return {
    message: `<!DOCTYPE html><html><head><title>supabase.co | ${status}: Connection timed out</title>`,
  };
}

describe("customer Explore server data fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActivities.mockResolvedValue([]);
    mocks.getStates.mockResolvedValue([]);
    // Explore no longer queries Supabase directly; the client only feeds getStatesWithPlaces (mocked).
    mocks.createClient.mockResolvedValue({});
  });

  it("renders with empty data when Supabase returns transient server errors", async () => {
    mocks.getActivities.mockRejectedValue(upstreamError(522));
    mocks.getStates.mockRejectedValue(upstreamError(503));

    const page = await ExplorePage();

    expect(page.props).toMatchObject({
      initialActivities: [],
      statesWithPlaces: [],
      dataUnavailable: true,
    });
  });

  it("preserves successful Explore data when one source is temporarily unavailable", async () => {
    const activities = [{ id: "activity-1" }];
    mocks.getActivities.mockResolvedValue(activities);
    mocks.getStates.mockRejectedValue(upstreamError(503));

    const page = await ExplorePage();

    expect(page.props).toMatchObject({
      initialActivities: activities,
      statesWithPlaces: [],
      dataUnavailable: true,
    });
  });

  it("continues to throw non-transient query errors", async () => {
    const schemaError = { message: "column does not exist", code: "42703" };
    mocks.getActivities.mockRejectedValue(schemaError);

    await expect(ExplorePage()).rejects.toBe(schemaError);
  });
});
