import { describe, expect, it } from "vitest";

import {
  addMalaysiaCalendarDays,
  getMalaysiaDateInputValue,
  getMalaysiaDateTimeLocalValue,
  getMalaysiaDateRangeDefaults,
  getMalaysiaDateShortcutDates,
} from "@/lib/datetime/date-input";

describe("Malaysia calendar input helpers", () => {
  it("formats today and a seven-day range in Malaysia time", () => {
    const now = new Date("2026-09-12T16:30:00.000Z");

    expect(getMalaysiaDateInputValue(now)).toBe("2026-09-13");
    expect(getMalaysiaDateRangeDefaults(now)).toEqual({ from: "2026-09-13", to: "2026-09-20" });
  });

  it("adds calendar days without browser timezone drift", () => {
    expect(addMalaysiaCalendarDays("2026-09-30", 7)).toBe("2026-10-07");
    expect(addMalaysiaCalendarDays("2026-12-29", 7)).toBe("2027-01-05");
  });

  it("formats datetime-local values for Malaysia forms", () => {
    expect(getMalaysiaDateTimeLocalValue(new Date("2026-09-12T03:25:00.000Z"))).toBe("2026-09-12T11:25");
  });

  it("returns shortcut dates using the Malaysia calendar", () => {
    const now = new Date("2026-09-16T04:00:00.000Z");

    expect(getMalaysiaDateShortcutDates("today", now)).toEqual(["2026-09-16"]);
    expect(getMalaysiaDateShortcutDates("tomorrow", now)).toEqual(["2026-09-17"]);
    expect(getMalaysiaDateShortcutDates("weekend", now)).toEqual(["2026-09-19", "2026-09-20"]);
  });
});
