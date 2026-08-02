import { describe, expect, it } from "vitest";
import type { BookingSlot } from "@/backend/core/types";
import {
  formatBookingSlotDate,
  formatBookingSlotTime,
  getBookingCalendarDays,
  getBookingDatePreview,
  groupBookableBookingSlotsByDate,
  groupBookingSlotsByDate,
  isBookingSlotAvailable,
} from "@/lib/customer/booking-slot-presenter";

function slot(id: string, startsAt: string, overrides: Partial<BookingSlot> = {}): BookingSlot {
  return { id, activityId: "activity-1", startsAt, capacity: 10, booked: 1, ...overrides };
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

  it("only treats future slots with capacity and an available status as bookable", () => {
    const now = new Date("2026-08-02T00:00:00+08:00");

    expect(isBookingSlotAvailable(slot("available", "2026-08-03T10:00:00+08:00"), now)).toBe(true);
    expect(isBookingSlotAvailable(slot("missing-status", "2026-08-03T11:00:00+08:00", { status: undefined }), now)).toBe(true);
    expect(isBookingSlotAvailable(slot("full", "2026-08-03T12:00:00+08:00", { booked: 10, status: "available" }), now)).toBe(false);
    expect(isBookingSlotAvailable(slot("expired", "2026-08-01T12:00:00+08:00", { status: "expired" }), now)).toBe(false);
    expect(isBookingSlotAvailable(slot("blocked", "2026-08-03T13:00:00+08:00", { status: "paused" }), now)).toBe(false);
  });

  it("keeps only dates with at least one bookable slot for the date rail", () => {
    const now = new Date("2026-08-02T00:00:00+08:00");
    const groups = groupBookableBookingSlotsByDate([
      slot("past", "2026-08-01T10:00:00+08:00"),
      slot("full", "2026-08-03T10:00:00+08:00", { booked: 10 }),
      slot("available", "2026-08-04T10:00:00+08:00"),
    ], now);

    expect(groups.map((group) => group.key)).toEqual(["2026-08-04"]);
  });

  it("classifies calendar dates so full and unavailable dates are not selectable", () => {
    const now = new Date("2026-08-02T00:00:00+08:00");
    const days = getBookingCalendarDays([
      slot("available", "2026-08-03T10:00:00+08:00"),
      slot("full", "2026-08-04T10:00:00+08:00", { booked: 10 }),
      slot("expired", "2026-08-01T10:00:00+08:00", { status: "expired" }),
    ], "2026-08", now);

    expect(days.find((day) => day.key === "2026-08-03")).toMatchObject({ status: "available", availableSlotCount: 1 });
    expect(days.find((day) => day.key === "2026-08-04")).toMatchObject({ status: "full", availableSlotCount: 0 });
    expect(days.find((day) => day.key === "2026-08-01")).toMatchObject({ status: "unavailable", availableSlotCount: 0 });
  });
});
