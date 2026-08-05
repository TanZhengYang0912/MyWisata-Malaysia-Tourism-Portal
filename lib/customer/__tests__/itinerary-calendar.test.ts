import { describe, expect, it } from "vitest";
import type { Booking } from "@/backend/core/types";
import {
  countItineraryGroupsInMonth,
  getHiddenItineraryGroupCount,
  groupBookings,
  groupBookingsByDay,
} from "@/lib/customer/itinerary-calendar";

const booking = (id: string, slotStartsAt: string): Booking => ({
  id,
  orderId: `order-${id}`,
  activityId: "activity-1",
  activityName: "Activity 1",
  outletId: "outlet-1",
  slotStartsAt,
  qty: 1,
  status: "confirmed",
  qrCode: "demo",
});

function bookingWith(overrides: Partial<Booking> & Pick<Booking, "id">): Booking {
  return {
    ...booking(overrides.id, overrides.slotStartsAt ?? "2026-08-03T01:57:00+08:00"),
    ...overrides,
  };
}

describe("itinerary calendar helpers", () => {
  it("groups equivalent activity bookings and preserves every order row", () => {
    const first = bookingWith({ id: "first", qty: 1 });
    const second = bookingWith({ id: "second", qty: 3, orderId: "order-second" });
    const third = bookingWith({ id: "third", qty: 1, orderId: "order-third" });
    const fourth = bookingWith({ id: "fourth", qty: 2, orderId: "order-fourth" });
    const groups = groupBookings([first, second, third, fourth]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ totalQty: 7, activityName: first.activityName, outletId: first.outletId });
    expect(groups[0].bookings).toEqual([first, second, third, fourth]);
  });

  it("keeps different activity, outlet, and time combinations as separate itinerary groups", () => {
    const sameActivityDifferentTime = booking("later", "2026-08-03T02:57:00+08:00");
    const differentActivity = bookingWith({ id: "different-activity", activityId: "activity-2" });
    const differentOutlet = bookingWith({ id: "different-outlet", outletId: "outlet-2" });

    expect(groupBookings([sameActivityDifferentTime, differentActivity, differentOutlet])).toHaveLength(3);
  });

  it("groups itinerary entries by calendar day while preserving group order", () => {
    const first = booking("first", "2026-08-03T01:57:00+08:00");
    const second = booking("second", "2026-08-03T10:57:00+08:00");
    const third = booking("third", "2026-08-04T10:57:00+08:00");

    expect(groupBookingsByDay([first, second, third])).toEqual({
      "2026-08-03": [expect.objectContaining({ bookings: [first] }), expect.objectContaining({ bookings: [second] })],
      "2026-08-04": [expect.objectContaining({ bookings: [third] })],
    });
  });

  it("counts itinerary groups hidden after the three visible calendar entries", () => {
    const groups = groupBookings([
      booking("1", "2026-08-03T01:57:00+08:00"),
      booking("2", "2026-08-03T02:57:00+08:00"),
      booking("3", "2026-08-03T03:57:00+08:00"),
      booking("4", "2026-08-03T04:57:00+08:00"),
    ]);

    expect(getHiddenItineraryGroupCount(groups)).toBe(1);
    expect(getHiddenItineraryGroupCount(groups.slice(0, 1))).toBe(0);
  });

  it("counts itinerary groups in the current month separately from overall rows", () => {
    const august = booking("august", "2026-08-03T01:57:00+08:00");
    const september = booking("september", "2026-09-03T01:57:00+08:00");

    expect(countItineraryGroupsInMonth([august, september], new Date(2026, 7, 1))).toBe(1);
  });

  it("uses Malaysia calendar boundaries regardless of the runtime timezone", () => {
    const boundary = booking("boundary", "2026-08-03T00:30:00+08:00");

    expect(groupBookingsByDay([boundary])).toEqual({ "2026-08-03": [expect.objectContaining({ bookings: [boundary] })] });
    expect(countItineraryGroupsInMonth([boundary], new Date("2026-08-01T00:00:00+08:00"))).toBe(1);
  });
});
