import { describe, expect, it } from "vitest";
import type { Trip, TripItem } from "@/backend/domains/trips";
import {
  resolveTripOrigin,
  getTripDiscoveryAnchor,
  getTripDiscoveryFingerprint,
  getTripBudgetEstimate,
  applyTripOrder,
  getTripScheduleIssue,
  getTripLegFeasibility,
  getTripItemTimeBounds,
  groupTripItemsByDay,
  getTripDayDates,
  hasChronologicalTripTimes,
  isValidTripCoordinate,
  selectTripDayWeatherAnchor,
  getTripActivitySublabel,
  hasDistinctTripRoutePoints,
} from "@/lib/customer/trip-planner";

const trip: Trip = {
  id: "trip-1",
  user_id: "user-1",
  name: "Penang Weekend Gateway",
  start_date: "2026-08-15",
  end_date: "2026-08-17",
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
};

function item(id: string, overrides: Partial<TripItem> = {}): TripItem {
  return {
    id,
    trip_id: trip.id,
    experience_id: id,
    sequence: 0,
    scheduled_date: null,
    scheduled_time: null,
    created_at: "2026-08-01T00:00:00.000Z",
    source: "vendor",
    lat: 5.4,
    lng: 100.3,
    label: id,
    ...overrides,
  };
}

describe("trip planner scheduling helpers", () => {
  it("detects whether a route contains more than one location", () => {
    expect(hasDistinctTripRoutePoints([])).toBe(false);
    expect(hasDistinctTripRoutePoints([[2.1957651, 102.2457348]])).toBe(false);
    expect(hasDistinctTripRoutePoints([[2.1957651, 102.2457348], [2.1957651, 102.2457348]])).toBe(false);
    expect(hasDistinctTripRoutePoints([[2, 102], [2, 102], [3, 103]])).toBe(true);
    expect(hasDistinctTripRoutePoints([[2, 102], [3, 103], [2, 102]])).toBe(true);
  });

  it("uses the valid origin or the selected day's last valid stop for discovery", () => {
    const items = [
      item("other-day", { scheduled_date: "2026-08-16", sequence: 1, lat: 6, lng: 101 }),
      item("first", { scheduled_date: "2026-08-15", sequence: 2, lat: 5, lng: 100 }),
      item("last", { scheduled_date: "2026-08-15", sequence: 3, lat: 4, lng: 99 }),
    ];
    expect(getTripDiscoveryAnchor(items, "2026-08-15")).toEqual({ lat: 4, lng: 99 });
    expect(getTripDiscoveryFingerprint(items, "2026-08-15")).toContain('"anchor":{"lat":4,"lng":99}');
    expect(getTripDiscoveryFingerprint(items, "2026-08-15")).toBe(getTripDiscoveryFingerprint([...items].reverse(), "2026-08-15"));
  });

  it("uses the current catalogue price and outlet for linked activities", () => {
    expect(getTripActivitySublabel(
      { price: 75, outlet: { city: "George Town" } },
      "RM 60 · Penang",
      (price) => `RM ${price.toFixed(2)}`,
      "Place details unavailable",
    )).toBe("RM 75.00 · George Town");
  });

  it("keeps saved text for custom stops and uses it when a linked activity is unavailable", () => {
    expect(getTripActivitySublabel(undefined, "My saved location", (price) => `RM ${price}`, "Place details unavailable"))
      .toBe("My saved location");
    expect(getTripActivitySublabel(undefined, undefined, (price) => `RM ${price}`, "Place details unavailable"))
      .toBe("Place details unavailable");
  });

  it("creates every inclusive calendar day for a dated trip", () => {
    expect(getTripDayDates(trip)).toEqual(["2026-08-15", "2026-08-16", "2026-08-17"]);
  });

  it("keeps scheduled items in their day and new items in Unscheduled", () => {
    const grouped = groupTripItemsByDay(trip, [
      item("kek-lok-si", { scheduled_date: "2026-08-16", sequence: 1 }),
      item("unplanned", { sequence: 2 }),
    ]);

    expect(grouped.days.find((day) => day.date === "2026-08-16")?.items.map((entry) => entry.label)).toEqual(["kek-lok-si"]);
    expect(grouped.unscheduled.map((entry) => entry.label)).toEqual(["unplanned"]);
  });

  it("places dated items outside the trip range in Unscheduled", () => {
    const grouped = groupTripItemsByDay(trip, [item("outside", { scheduled_date: "2026-08-20" })]);

    expect(grouped.unscheduled.map((entry) => entry.label)).toEqual(["outside"]);
    expect(grouped.days.every((day) => day.items.length === 0)).toBe(true);
  });

  it("requires same-day times to increase with the itinerary sequence", () => {
    const ordered = [
      item("breakfast", { sequence: 1, scheduled_date: "2026-08-15", scheduled_time: "10:00" }),
      item("lunch", { sequence: 2, scheduled_date: "2026-08-15", scheduled_time: "11:30" }),
    ];
    const reversed = ordered.map((entry) => ({ ...entry }));
    reversed[1].scheduled_time = "09:59";
    const equal = ordered.map((entry) => ({ ...entry }));
    equal[1].scheduled_time = "10:00";

    expect(hasChronologicalTripTimes(ordered)).toBe(true);
    expect(hasChronologicalTripTimes(reversed)).toBe(false);
    expect(hasChronologicalTripTimes(equal)).toBe(false);
  });

  it("compares PostgreSQL TIME values with seconds at minute precision", () => {
    const items = [
      item("first", { sequence: 1, scheduled_date: "2026-08-15", scheduled_time: "09:00:00" }),
      item("second", { sequence: 2, scheduled_date: "2026-08-15", scheduled_time: "10:00:00" }),
    ];

    expect(hasChronologicalTripTimes(items)).toBe(true);
    expect(getTripItemTimeBounds(items, "second")).toEqual({ min: "09:01" });
    expect(hasChronologicalTripTimes([{ ...items[0], scheduled_time: "10:00:00" }, items[1]])).toBe(false);
  });

  it("does not constrain untimed items or items scheduled on another day", () => {
    expect(hasChronologicalTripTimes([
      item("first", { sequence: 1, scheduled_date: "2026-08-15", scheduled_time: "14:00" }),
      item("untimed", { sequence: 2, scheduled_date: "2026-08-15", scheduled_time: null }),
      item("next-day", { sequence: 3, scheduled_date: "2026-08-16", scheduled_time: "09:00" }),
    ])).toBe(true);
  });

  it("gives a stop exclusive minute bounds from its nearest timed neighbours", () => {
    const items = [
      item("first", { sequence: 1, scheduled_date: "2026-08-15", scheduled_time: "10:00" }),
      item("middle", { sequence: 2, scheduled_date: "2026-08-15", scheduled_time: null }),
      item("last", { sequence: 3, scheduled_date: "2026-08-15", scheduled_time: "12:00" }),
      item("other-day", { sequence: 4, scheduled_date: "2026-08-16", scheduled_time: "10:30" }),
    ];

    expect(getTripItemTimeBounds(items, "middle")).toEqual({ min: "10:01", max: "11:59" });
    expect(getTripItemTimeBounds(items, "first")).toEqual({ max: "11:59" });
    expect(getTripItemTimeBounds(items, "last")).toEqual({ min: "10:01" });
  });

  it("disables time selection when no minute exists between neighbouring stops", () => {
    expect(getTripItemTimeBounds([
      item("first", { sequence: 1, scheduled_date: "2026-08-15", scheduled_time: "23:59" }),
      item("last", { sequence: 2, scheduled_date: "2026-08-15", scheduled_time: null }),
    ], "last")).toEqual({ disabled: true });

    expect(getTripItemTimeBounds([
      item("first", { sequence: 1, scheduled_date: "2026-08-15", scheduled_time: null }),
      item("last", { sequence: 2, scheduled_date: "2026-08-15", scheduled_time: "00:00" }),
    ], "first")).toEqual({ disabled: true });

    expect(getTripItemTimeBounds([
      item("first", { sequence: 1, scheduled_date: "2026-08-15", scheduled_time: "10:00" }),
      item("middle", { sequence: 2, scheduled_date: "2026-08-15", scheduled_time: null }),
      item("last", { sequence: 3, scheduled_date: "2026-08-15", scheduled_time: "10:01" }),
    ], "middle")).toEqual({ disabled: true });
  });

  it("selects the first sequenced valid coordinate as the day weather anchor", () => {
    const anchor = selectTripDayWeatherAnchor([
      item("later", { sequence: 4, label: "Penang Hill" }),
      item("invalid", { sequence: 0, lat: Number.NaN }),
      item("first", { sequence: 2, label: "Kek Lok Si" }),
    ]);

    expect(anchor).toEqual(expect.objectContaining({ id: "first", label: "Kek Lok Si" }));
  });

  it("does not borrow a weather coordinate from another trip day", () => {
    const grouped = groupTripItemsByDay(trip, [
      item("penang", { scheduled_date: "2026-08-15", label: "George Town", lat: 5.4141, lng: 100.3288 }),
      item("langkawi", { scheduled_date: "2026-08-16", label: "Langkawi Cable Car", lat: 6.3711, lng: 99.6717 }),
    ]);

    expect(selectTripDayWeatherAnchor(grouped.days[0].items)?.label).toBe("George Town");
    expect(selectTripDayWeatherAnchor(grouped.days[1].items)?.label).toBe("Langkawi Cable Car");
    expect(selectTripDayWeatherAnchor([])).toBeNull();
  });

  it.each([
    [5.4, 100.3, true],
    [Number.NaN, 100.3, false],
    [91, 100.3, false],
    [-91, 100.3, false],
    [5.4, 181, false],
    [5.4, -181, false],
  ])("validates trip coordinates %s, %s", (lat, lng, expected) => {
    expect(isValidTripCoordinate(lat, lng)).toBe(expected);
  });


});

 describe("trip reliability", () => {
  it("resequences the complete trip and rejects partial or duplicate IDs", () => {
    const rows = [item("a"), item("b", {sequence: 1})];
    expect(applyTripOrder(rows, ["b", "a"]).map(row => [row.id, row.sequence])).toEqual([["b", 0], ["a", 1]]);
    expect(() => applyTripOrder(rows, ["a"])).toThrow();
    expect(() => applyTripOrder(rows, ["a", "a"])).toThrow();
  });
  it("validates the same date and time contract for all mutations", () => {
    expect(getTripScheduleIssue(trip, [item("x", {scheduled_date: "2026-08-18"})])).toBe("date_outside_trip");
    expect(getTripScheduleIssue(trip, [item("x", {scheduled_time: "12:00"})])).toBe("time_without_date");
    expect(getTripScheduleIssue(trip, [item("x", {scheduled_date: "2026-08-15", scheduled_time: "25:00"})])).toBe("invalid_time");
    expect(getTripScheduleIssue(trip, [item("a", {scheduled_date: "2026-08-15", scheduled_time: "10:00:00"}), item("b", {sequence: 1, scheduled_date: "2026-08-15", scheduled_time: "09:00"})])).toBe("non_chronological");
  });
  it("requires a daily origin to be the first stop on its day", () => {
    const stop = item("stop", {sequence: 0, scheduled_date: "2026-08-15", scheduled_time: "10:00"});
    const origin = item("origin", {sequence: 1, source: "location", experience_id: null, scheduled_date: "2026-08-15", is_day_origin: true});
    expect(getTripScheduleIssue(trip, [stop, origin])).toBe("daily_origin_order");
    expect(getTripScheduleIssue(trip, [{...origin, sequence: 0}, {...stop, sequence: 1}])).toBeNull();
  });
  it("reports known travel shortages without inventing stay durations", () => {
    expect(getTripLegFeasibility({previousStart:600, previousEnd:660, nextStart:630, travelMinutes:45})).toEqual({status:"conflict", slackMinutes:-75});
    expect(getTripLegFeasibility({previousStart:600, previousEnd:null, nextStart:720, travelMinutes:45}).status).toBe("unknown");
    expect(getTripLegFeasibility({previousStart:600, previousEnd:660, nextStart:720, travelMinutes:45})).toEqual({status:"fits_estimate", slackMinutes:15});
    expect(getTripLegFeasibility({previousStart:600, previousEnd:null, nextStart:620, travelMinutes:45}).status).toBe("conflict");
    expect(getTripLegFeasibility({previousStart:600, previousEnd:660, nextStart:720, travelMinutes:null}).status).toBe("unknown");
  });
});

it("resolves explicit daily starts without inferring an overnight location",()=>{
  const global=item("kl",{source:"location",experience_id:null});
  const daily=item("melaka",{source:"location",experience_id:null,scheduled_date:"2026-08-16",is_day_origin:true});
  expect(resolveTripOrigin([global,daily],"2026-08-15")?.id).toBe("kl");
  expect(resolveTripOrigin([global,daily],"2026-08-16")?.id).toBe("melaka");
  expect(resolveTripOrigin([daily],"2026-08-15")).toBeNull();
});
it("distinguishes an unknown outlet price from a real free listing",()=>{
  expect(getTripBudgetEstimate([item("free"),item("missing")],new Map([["free",{id:"free",outletId:"o",price:0,variants:[]}]]))).toEqual({total:0,unknownCount:1});
});

it("does not present an unchosen multi-variant price as a complete estimate",()=>{
  expect(getTripBudgetEstimate([item("multi")],new Map([["multi",{id:"multi",outletId:"o",price:10,variants:[{id:"a",label:"Adult",priceDelta:20},{id:"b",label:"Child",priceDelta:0}]}]]))).toEqual({total:0,unknownCount:1});
});
