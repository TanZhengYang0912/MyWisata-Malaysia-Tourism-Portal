import { describe, expect, it } from "vitest";
import type { PromotionCampaignPublic, PromotionCampaignPublicLocation } from "@/lib/promotion-campaigns/types";
import { DEMO_STATES } from "@/lib/demo-map/data";
import {
  buildEventStateBreakdown,
  EVENT_MAP_REGION_IDS,
  EVENT_MAP_REGION_STATES,
  eventMapRegionIds,
  eventMapStateIds,
  resolveEventLocationState,
} from "../event-state-counts";

const TODAY = "2026-10-03";

function location(
  id: string,
  overrides: Partial<PromotionCampaignPublicLocation> = {},
): PromotionCampaignPublicLocation {
  return {
    id,
    name: "Event location",
    address: null,
    lat: null,
    lng: null,
    startsOn: TODAY,
    endsOn: "2026-10-10",
    opensAt: "10:00",
    closesAt: "18:00",
    ...overrides,
  };
}

function campaign(id: string, locations: PromotionCampaignPublicLocation[]): PromotionCampaignPublic {
  return {
    id,
    slug: id,
    title: `Event ${id}`,
    summary: "Event summary",
    description: "Event description",
    posterUrl: null,
    operatingHours: null,
    startsAt: `${TODAY}T00:00:00.000Z`,
    endsAt: "2026-10-10T00:00:00.000Z",
    visibility: "live",
    locations,
    vendors: [],
  };
}

describe("promotion campaign event-state breakdown", () => {
  it("resolves coordinates to state boundaries and uses explicit state names as fallback", () => {
    expect(resolveEventLocationState(location("kl", { lat: 3.139, lng: 101.6869 }))).toBe("kuala-lumpur");
    expect(resolveEventLocationState(location("sabah", { lat: 5.9804, lng: 116.0735 }))).toBe("sabah");
    expect(resolveEventLocationState(location("penang", { name: "George Town, Penang" }))).toBe("penang");
    expect(resolveEventLocationState(location("unknown", { name: "A venue in Malaysia" }))).toBeNull();
  });

  it("counts one campaign once per state while allowing its other-state locations", () => {
    const multiLocationCampaign = campaign("multi", [
      location("kl-one", { lat: 3.139, lng: 101.6869 }),
      location("kl-two", { lat: 3.15, lng: 101.7 }),
      location("sabah-one", { lat: 5.9804, lng: 116.0735 }),
    ]);

    const result = buildEventStateBreakdown([multiLocationCampaign], TODAY);

    expect(result.allCampaigns.map((item) => item.id)).toEqual(["multi"]);
    expect(result.campaignsByState["kuala-lumpur"].map((item) => item.id)).toEqual(["multi"]);
    expect(result.campaignsByState.sabah.map((item) => item.id)).toEqual(["multi"]);
    expect(result.unlocatedCampaigns).toEqual([]);
  });

  it("keeps unresolved active campaigns visible and excludes expired locations", () => {
    const unresolved = campaign("unknown", [location("no-state")]);
    const expired = campaign("expired", [location("past", { endsOn: "2026-10-02" })]);

    const result = buildEventStateBreakdown([unresolved, expired], TODAY);

    expect(result.allCampaigns.map((item) => item.id)).toEqual(["unknown"]);
    expect(result.unlocatedCampaigns.map((item) => item.id)).toEqual(["unknown"]);
    expect(Object.values(result.campaignsByState).flat()).toEqual([]);
  });
});

describe("Events map regions", () => {
  const KL = { lat: 3.139, lng: 101.6869 };
  const IPOH = { lat: 4.5975, lng: 101.079 };
  const JOHOR_BAHRU = { lat: 1.548, lng: 103.7956 };

  it("puts every state in exactly one region, with Pahang on the East Coast", () => {
    const regionsOf = (stateId: string) => EVENT_MAP_REGION_IDS.filter((region) => EVENT_MAP_REGION_STATES[region].includes(stateId));
    for (const state of DEMO_STATES) expect(regionsOf(state.id), state.id).toHaveLength(1);
    expect(regionsOf("pahang")).toEqual(["east-coast"]);
    expect(Object.values(EVENT_MAP_REGION_STATES).flat()).toHaveLength(DEMO_STATES.length);
  });

  it("without a day, uses the stops that have not ended", () => {
    const fair = campaign("fair", [
      location("kl", { ...KL, endsOn: "2026-10-05" }),
      location("jb-ended", { ...JOHOR_BAHRU, startsOn: "2026-09-01", endsOn: "2026-10-02" }),
    ]);
    const states = eventMapStateIds(fair, TODAY, null);
    expect([...states]).toEqual(["kuala-lumpur"]);
    expect([...eventMapRegionIds(states)]).toEqual(["central"]);
  });

  it("with a day, uses only the stops running that day", () => {
    const tour = campaign("tour", [
      location("kl", { ...KL, startsOn: "2026-12-01", endsOn: "2026-12-02" }),
      location("ipoh", { ...IPOH, startsOn: "2026-11-28", endsOn: "2026-11-30" }),
    ]);
    expect([...eventMapRegionIds(eventMapStateIds(tour, TODAY, "2026-11-29"))]).toEqual(["north"]);
    expect([...eventMapRegionIds(eventMapStateIds(tour, TODAY, "2026-12-02"))]).toEqual(["central"]);
    expect(eventMapStateIds(tour, TODAY, "2026-11-27").size).toBe(0);
  });

  it("gives no region when no active stop resolves to a state", () => {
    const unknown = campaign("unknown", [location("no-state")]);
    expect(eventMapRegionIds(eventMapStateIds(unknown, TODAY, null)).size).toBe(0);
  });
});
