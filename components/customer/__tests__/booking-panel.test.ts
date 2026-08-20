import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "app/customer/activity/[id]/bodies/booking-panel.tsx"), "utf8");

describe("booking panel availability calendar contract", () => {
  it("uses the custom availability-aware calendar instead of a native date input", () => {
    expect(source).toContain("getBookingCalendarDays");
    expect(source).not.toContain('type="date"');
    expect(source).toContain('aria-expanded={calendarOpen}');
  });

  it("communicates the date states in the calendar UI", () => {
    expect(source).toContain('t("ui.booking.available")');
    expect(source).toContain('t("ui.booking.full")');
    expect(source).toContain('t("ui.booking.unavailable")');
  });
});
