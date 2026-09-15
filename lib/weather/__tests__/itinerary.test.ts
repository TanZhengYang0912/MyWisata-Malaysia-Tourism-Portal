import { describe, expect, it } from "vitest";
import type { ComputedActivity } from "@/backend/core/types";
import type { TripDayGroup } from "@/lib/customer/trip-planner";
import type { TripItem } from "@/backend/domains/trips";
import { buildItineraryWeatherPlan } from "@/lib/weather/itinerary";

function item(id: string, date: string, overrides: Partial<TripItem> = {}): TripItem {
  return {
    id,
    trip_id: "trip-1",
    experience_id: id,
    sequence: 0,
    scheduled_date: date,
    scheduled_time: "10:00",
    created_at: "2026-09-01T00:00:00.000Z",
    source: "vendor",
    lat: 5.4141,
    lng: 100.3288,
    label: id,
    ...overrides,
  };
}

function activity(indoorOutdoor: string, typeSlugs: string[] = []): ComputedActivity {
  return { attributes: { indoorOutdoor }, typeSlugs } as unknown as ComputedActivity;
}

describe("itinerary weather target planning", () => {
  it("creates one named day target per day-local anchor", () => {
    const days: TripDayGroup[] = [
      { date: "2026-09-15", items: [item("penang", "2026-09-15", { label: "George Town" })] },
      { date: "2026-09-16", items: [item("langkawi", "2026-09-16", { label: "Langkawi Cable Car", lat: 6.3711, lng: 99.6717 })] },
    ];
    const plan = buildItineraryWeatherPlan(days, new Map());

    expect(plan.targets.map((target) => target.label)).toEqual(["George Town", "Langkawi Cable Car"]);
    expect(plan.dayTargetKeyByDate["2026-09-15"]).not.toBe(plan.dayTargetKeyByDate["2026-09-16"]);
  });

  it("does not create a day target without a valid coordinate", () => {
    const days = [{ date: "2026-09-15", items: [item("invalid", "2026-09-15", { lat: Number.NaN })] }];
    expect(buildItineraryWeatherPlan(days, new Map()).targets).toEqual([]);
  });

  it("adds item targets only for explicitly weather-sensitive activities", () => {
    const outdoor = item("outdoor", "2026-09-15", { sequence: 1, lat: 5.42 });
    const indoor = item("indoor", "2026-09-15", { sequence: 2, lat: 5.43 });
    const unknown = item("unknown", "2026-09-15", { sequence: 3, lat: 5.44 });
    const activities = new Map<string, ComputedActivity>([
      ["outdoor", activity("Outdoor")],
      ["indoor", activity("Indoor")],
      ["unknown", activity("")],
    ]);
    const plan = buildItineraryWeatherPlan([{ date: "2026-09-15", items: [outdoor, indoor, unknown] }], activities);

    expect(plan.itemTargetKeyById.outdoor).toBeTruthy();
    expect(plan.itemTargetKeyById.indoor).toBeUndefined();
    expect(plan.itemTargetKeyById.unknown).toBeUndefined();
  });

  it("deduplicates rounded coordinate/date targets", () => {
    const first = item("first", "2026-09-15", { lat: 5.41411, lng: 100.32881 });
    const second = item("second", "2026-09-15", { sequence: 1, lat: 5.41412, lng: 100.32882 });
    const activities = new Map<string, ComputedActivity>([
      ["first", activity("Outdoor")],
      ["second", activity("Outdoor")],
    ]);
    const plan = buildItineraryWeatherPlan([{ date: "2026-09-15", items: [first, second] }], activities);

    expect(plan.targets).toHaveLength(1);
    expect(plan.itemTargetKeyById.first).toBe(plan.dayTargetKeyByDate["2026-09-15"]);
    expect(plan.itemTargetKeyById.second).toBe(plan.dayTargetKeyByDate["2026-09-15"]);
  });

  it("caps unique targets at twenty with day targets first", () => {
    const days = Array.from({ length: 22 }, (_, index) => {
      const date = `2026-10-${String(index + 1).padStart(2, "0")}`;
      return { date, items: [item(`item-${index}`, date, { lat: 1 + index * 0.1 })] };
    });
    const plan = buildItineraryWeatherPlan(days, new Map());

    expect(plan.targets).toHaveLength(20);
    expect(Object.keys(plan.dayTargetKeyByDate)).toHaveLength(20);
    expect(plan.dayTargetKeyByDate["2026-10-22"]).toBeUndefined();
  });
});
