import { describe, expect, it } from "vitest";
import type { Booking } from "@/backend/core/types";
import { countBookingsInMonth, getHiddenBookingCount, groupBookingsByDay } from "@/lib/customer/itinerary-calendar";

const booking = (id: string, slotStartsAt: string): Booking => ({
  id,
  orderId: `order-${id}`,
  activityId: `activity-${id}`,
  activityName: `Activity ${id}`,
  outletId: "outlet-1",
  slotStartsAt,
  qty: 1,
  status: "confirmed",
  qrCode: "demo",
});

describe("itinerary calendar helpers", () => {
  it("groups bookings by calendar day while preserving the filtered order", () => {
    const first = booking("first", "2026-08-03T01:57:00+08:00");
    const second = booking("second", "2026-08-03T10:57:00+08:00");
    const third = booking("third", "2026-08-04T10:57:00+08:00");

    expect(groupBookingsByDay([first, second, third])).toEqual({
      "2026-08-03": [first, second],
      "2026-08-04": [third],
    });
  });

  it("counts only bookings hidden after the three visible calendar entries", () => {
    expect(getHiddenBookingCount([booking("1", "2026-08-03T01:57:00+08:00"), booking("2", "2026-08-03T02:57:00+08:00"), booking("3", "2026-08-03T03:57:00+08:00"), booking("4", "2026-08-03T04:57:00+08:00")])).toBe(1);
    expect(getHiddenBookingCount([booking("1", "2026-08-03T01:57:00+08:00")])).toBe(0);
  });

  it("counts the current month separately from the total filtered calendar results", () => {
    const august = booking("august", "2026-08-03T01:57:00+08:00");
    const september = booking("september", "2026-09-03T01:57:00+08:00");

    expect(countBookingsInMonth([august, september], new Date(2026, 7, 1))).toBe(1);
  });

  it("uses Malaysia calendar boundaries regardless of the runtime timezone", () => {
    const boundary = booking("boundary", "2026-08-03T00:30:00+08:00");

    expect(groupBookingsByDay([boundary])).toEqual({ "2026-08-03": [boundary] });
    expect(countBookingsInMonth([boundary], new Date("2026-08-01T00:00:00+08:00"))).toBe(1);
  });
});
