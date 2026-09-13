import { describe, expect, it } from "vitest";
import type { Trip } from "@/backend/domains/trips";
import { filterTrips, type TripFilters } from "../trip-filters";

const trips: Trip[] = [
  {
    id: "penang",
    user_id: "user-1",
    name: "Penang Weekend Gateway",
    start_date: "2026-09-20",
    end_date: "2026-09-22",
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-09-10T00:00:00.000Z",
  },
  {
    id: "melaka",
    user_id: "user-1",
    name: "Melaka Food Trail",
    start_date: "2026-08-01",
    end_date: "2026-08-03",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-08-02T00:00:00.000Z",
  },
  {
    id: "flexible",
    user_id: "user-1",
    name: "Flexible Malaysia Ideas",
    start_date: null,
    end_date: null,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
  },
];

const filters = (overrides: Partial<TripFilters> = {}): TripFilters => ({
  query: "",
  status: "all",
  from: "",
  to: "",
  sort: "newest",
  ...overrides,
});

describe("filterTrips", () => {
  it("matches trip names case-insensitively and filters by status", () => {
    expect(filterTrips(trips, filters({ query: "PENANG" }), "2026-09-12").map((trip) => trip.id)).toEqual(["penang"]);
    expect(filterTrips(trips, filters({ status: "upcoming" }), "2026-09-12").map((trip) => trip.id)).toEqual(["penang"]);
    expect(filterTrips(trips, filters({ status: "past" }), "2026-09-12").map((trip) => trip.id)).toEqual(["melaka"]);
    expect(filterTrips(trips, filters({ status: "unscheduled" }), "2026-09-12").map((trip) => trip.id)).toEqual(["flexible"]);
  });

  it("keeps trips that overlap the selected date range and excludes undated trips", () => {
    expect(filterTrips(trips, filters({ from: "2026-09-21", to: "2026-09-25" }), "2026-09-12").map((trip) => trip.id)).toEqual(["penang"]);
    expect(filterTrips(trips, filters({ from: "2026-09-25" }), "2026-09-12").map((trip) => trip.id)).toEqual([]);
  });

  it("sorts by recent changes, creation age, or trip date", () => {
    expect(filterTrips(trips, filters({ sort: "newest" }), "2026-09-12").map((trip) => trip.id)).toEqual(["penang", "flexible", "melaka"]);
    expect(filterTrips(trips, filters({ sort: "oldest" }), "2026-09-12").map((trip) => trip.id)).toEqual(["melaka", "penang", "flexible"]);
    expect(filterTrips(trips, filters({ sort: "tripDate" }), "2026-09-12").map((trip) => trip.id)).toEqual(["melaka", "penang", "flexible"]);
  });
});
