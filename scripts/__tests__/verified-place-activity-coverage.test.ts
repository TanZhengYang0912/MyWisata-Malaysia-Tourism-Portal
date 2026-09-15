import { describe, expect, it } from "vitest";

const { buildVerifiedPlaceActivityCoverage } = await import("../lib/verified-place-activity-coverage.mjs");

describe("verified place activity coverage", () => {
  it("reports a deterministic state-by-state gap list from active POIs only", () => {
    const coverage = buildVerifiedPlaceActivityCoverage({
      places: [
        { id: "j-1", slug: "johor-complete", name: "Johor Complete", state: "Johor", level: "poi", status: "active" },
        { id: "j-2", slug: "johor-gap", name: "Johor Gap", state: "Johor", level: "poi", status: "active" },
        { id: "p-1", slug: "penang-gap", name: "Penang Gap", state: "Penang", level: "poi", status: "active" },
        { id: "state-1", slug: "johor", name: "Johor", state: "Johor", level: "state", status: "active" },
        { id: "inactive-1", slug: "old-place", name: "Old Place", state: "Perak", level: "poi", status: "archived" },
      ],
      accessRows: [
        { place_id: "j-1", slug: "free-a", status: "active" },
        { place_id: "j-1", slug: "free-b", status: "active" },
        { place_id: "j-2", slug: "free-c", status: "active" },
      ],
      informationalRows: [
        { place_id: "j-1", slug: "info-a", status: "active" },
        { place_id: "p-1", slug: "info-b", status: "active" },
        { place_id: "p-1", slug: "info-c", status: "active" },
        { place_id: "p-1", slug: "inactive", status: "inactive" },
      ],
    });

    expect(coverage).toMatchObject({
      activePois: 3,
      activityTotal: 6,
      belowMinimumCount: 2,
      belowMinimum: [
        { slug: "johor-gap", state: "Johor", count: 1 },
        { slug: "penang-gap", state: "Penang", count: 2 },
      ],
      stateCoverage: [
        { state: "Johor", activePois: 2, completedPois: 1, belowMinimumCount: 1 },
        { state: "Penang", activePois: 1, completedPois: 0, belowMinimumCount: 1 },
      ],
    });
  });

  it("uses an explicit label for a POI whose state is absent", () => {
    const coverage = buildVerifiedPlaceActivityCoverage({
      places: [{ id: "unknown-1", slug: "unknown", name: "Unknown", state: null, level: "poi", status: "active" }],
      accessRows: [],
      informationalRows: [],
    });

    expect(coverage.stateCoverage).toEqual([expect.objectContaining({ state: "Unspecified", belowMinimumCount: 1 })]);
  });
});
