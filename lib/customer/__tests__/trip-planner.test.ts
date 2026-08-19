import { describe, expect, it } from "vitest";
import type { Trip, TripItem } from "@/backend/domains/trips";
import { groupTripItemsByDay, getTripDayDates } from "@/lib/customer/trip-planner";

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
});
