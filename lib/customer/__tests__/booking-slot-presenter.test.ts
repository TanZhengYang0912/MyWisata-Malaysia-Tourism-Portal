import { describe, expect, it } from "vitest";
import type { BookingSlot } from "@/backend/core/types";
import { formatBookingSlotDate, formatBookingSlotTime, getBookingDatePreview, groupBookingSlotsByDate } from "@/lib/customer/booking-slot-presenter";

function slot(id: string, startsAt: string): BookingSlot {
  return { id, activityId: "activity-1", startsAt, capacity: 10, booked: 1 };
}

describe("booking slot presentation", () => {
  it("groups slots by calendar date while preserving slot order", () => {
    const groups = groupBookingSlotsByDate([
      slot("late", "2026-07-10T14:00:00+08:00"),
      slot("next-day", "2026-07-11T10:00:00+08:00"),
      slot("early", "2026-07-10T10:00:00+08:00"),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].slots.map((item) => item.id)).toEqual(["late", "early"]);
    expect(groups[1].slots.map((item) => item.id)).toEqual(["next-day"]);
  });

  it("formats a date rail label and a compact time label", () => {
    expect(formatBookingSlotDate("2026-07-10T10:00:00+08:00")).toBe("Fri, 10 Jul");
    expect(formatBookingSlotTime("2026-07-10T22:30:00+08:00")).toBe("10:30 pm");
  });

  it("shows three dates and brings a calendar-selected date into the preview", () => {
    const groups = groupBookingSlotsByDate([
      slot("one", "2026-07-10T10:00:00+08:00"),
      slot("two", "2026-07-11T10:00:00+08:00"),
      slot("three", "2026-07-12T10:00:00+08:00"),
      slot("four", "2026-07-13T10:00:00+08:00"),
    ]);

    expect(getBookingDatePreview(groups, groups[0].key).map((group) => group.key)).toEqual(groups.slice(0, 3).map((group) => group.key));
    expect(getBookingDatePreview(groups, groups[3].key).map((group) => group.key)).toEqual([groups[3].key, groups[0].key, groups[1].key]);
  });
});
