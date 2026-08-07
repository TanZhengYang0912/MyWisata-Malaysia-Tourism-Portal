import { describe, expect, it } from "vitest";
import { hasDifferentBookingTime } from "@/lib/customer/booking-details";

describe("booking detail receipt visibility", () => {
  it("hides the full receipt for a single booking", () => {
    expect(hasDifferentBookingTime("booking-1", [
      { id: "booking-1", slotStartsAt: "2026-08-08T00:57:00.000Z" },
    ])).toBe(false);
  });

  it("hides the full receipt when sibling bookings share the same time", () => {
    expect(hasDifferentBookingTime("booking-1", [
      { id: "booking-1", slotStartsAt: "2026-08-08T00:57:00.000Z" },
      { id: "booking-2", slotStartsAt: "2026-08-08T00:57:00.000Z" },
    ])).toBe(false);
  });

  it("shows the full receipt when a sibling booking has a different time", () => {
    expect(hasDifferentBookingTime("booking-1", [
      { id: "booking-1", slotStartsAt: "2026-08-08T00:57:00.000Z" },
      { id: "booking-2", slotStartsAt: "2026-08-09T00:57:00.000Z" },
    ])).toBe(true);
  });
});
