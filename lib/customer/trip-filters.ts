import type { Trip } from "@/backend/domains/trips";

export type TripFilterStatus = "all" | "upcoming" | "past" | "unscheduled";
export type TripSort = "newest" | "oldest" | "tripDate";

export type TripFilters = {
  query: string;
  status: TripFilterStatus;
  from: string;
  to: string;
  sort: TripSort;
};

function tripStart(trip: Trip) {
  return trip.start_date ?? trip.end_date;
}

function tripEnd(trip: Trip) {
  return trip.end_date ?? trip.start_date;
}

function compareText(left: string | null, right: string | null) {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left.localeCompare(right);
}

function compareNewest(left: Trip, right: Trip) {
  return right.updated_at.localeCompare(left.updated_at) || right.created_at.localeCompare(left.created_at) || left.id.localeCompare(right.id);
}

function compareOldest(left: Trip, right: Trip) {
  return left.created_at.localeCompare(right.created_at) || left.updated_at.localeCompare(right.updated_at) || left.id.localeCompare(right.id);
}

function compareTripDate(left: Trip, right: Trip) {
  return compareText(tripStart(left), tripStart(right)) || left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
}

export function filterTrips(trips: Trip[], filters: TripFilters, today: string): Trip[] {
  const query = filters.query.trim().toLocaleLowerCase();
  const invalidDateRange = Boolean(filters.from && filters.to && filters.from > filters.to);

  return trips
    .filter((trip) => {
      if (invalidDateRange) return false;
      if (query && !trip.name.toLocaleLowerCase().includes(query)) return false;

      const start = tripStart(trip);
      const end = tripEnd(trip);
      const undated = !start && !end;
      const effectiveEnd = end ?? start;

      if (filters.status === "unscheduled" && !undated) return false;
      if (filters.status === "upcoming" && (!effectiveEnd || effectiveEnd < today)) return false;
      if (filters.status === "past" && (!effectiveEnd || effectiveEnd >= today)) return false;

      if (filters.from && (!end || end < filters.from)) return false;
      if (filters.to && (!start || start > filters.to)) return false;
      return true;
    })
    .sort(filters.sort === "oldest" ? compareOldest : filters.sort === "tripDate" ? compareTripDate : compareNewest);
}
