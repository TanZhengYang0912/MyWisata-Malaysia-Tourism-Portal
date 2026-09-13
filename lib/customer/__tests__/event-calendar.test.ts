import { describe, expect, it } from "vitest";
import {
  isOperatingHoursRangeAvailable,
  toCustomerCalendarEvents,
  type CustomerCalendarRecord,
} from "@/lib/customer/event-calendar";

const weekdayHours = {
  mon: { open: "09:00", close: "18:00" },
  tue: { open: "09:00", close: "18:00" },
  wed: { open: "09:00", close: "18:00" },
  thu: { open: "09:00", close: "18:00" },
  fri: { open: "09:00", close: "18:00" },
};

const record = (overrides: Partial<CustomerCalendarRecord> = {}): CustomerCalendarRecord => ({
  id: "slot-1",
  activityId: "activity-1",
  activityName: "George Town Walk",
  outletId: "outlet-1",
  outletName: "Armenian Street Outlet",
  vendorName: "George Town Walks",
  startsAt: "2026-09-14T06:00:00.000Z",
  endsAt: "2026-09-14T07:00:00.000Z",
  capacity: 10,
  booked: 3,
  status: "available",
  operatingHours: weekdayHours,
  ...overrides,
});

describe("customer event calendar", () => {
  it("only publishes future available slots that fit the outlet operating hours", () => {
    const events = toCustomerCalendarEvents([
      record(),
      record({ id: "full", booked: 10 }),
      record({ id: "outside", startsAt: "2026-09-14T11:00:00.000Z", endsAt: "2026-09-14T12:00:00.000Z" }),
    ], new Date("2026-09-12T00:00:00.000Z"));

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: "slot-1",
      title: "George Town Walk",
      start: "2026-09-14T06:00:00.000Z",
      end: "2026-09-14T07:00:00.000Z",
      extendedProps: { activityId: "activity-1", outletId: "outlet-1", remainingCapacity: 7 },
    });
  });

  it("supports an overnight operating-hours window without allowing a closed gap", () => {
    const hours = { fri: { open: "22:00", close: "02:00" } };
    expect(isOperatingHoursRangeAvailable("2026-09-11T14:00:00.000Z", "2026-09-11T15:00:00.000Z", hours)).toBe(true);
    expect(isOperatingHoursRangeAvailable("2026-09-11T10:00:00.000Z", "2026-09-11T11:00:00.000Z", hours)).toBe(false);
  });

  it("matches an Explore time window only when at least one operating day contains it", () => {
    expect(isOperatingHoursRangeAvailable("2026-09-14T06:00:00.000Z", "2026-09-14T08:00:00.000Z", weekdayHours)).toBe(true);
    expect(isOperatingHoursRangeAvailable("2026-09-14T10:00:00.000Z", "2026-09-14T12:00:00.000Z", weekdayHours)).toBe(false);
  });
});
