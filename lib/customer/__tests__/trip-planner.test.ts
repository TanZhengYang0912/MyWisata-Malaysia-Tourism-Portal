import { describe, expect, it } from "vitest";
import type { Trip, TripItem } from "@/backend/domains/trips";
import {
  getTripItemTimeBounds,
  groupTripItemsByDay,
  getTripDayDates,
  hasChronologicalTripTimes,
  isValidTripCoordinate,
  selectTripDayWeatherAnchor,
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
