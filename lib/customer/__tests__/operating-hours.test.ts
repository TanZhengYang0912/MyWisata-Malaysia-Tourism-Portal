import { describe, expect, it } from "vitest";
import type { OperatingHours } from "@/backend/core/types";
import {
  formatOperatingHours,
  formatHours,
  getDayTrackSegments,
  getNextOpening,
  getOperatingHoursPeriods,
  isOperatingHoursAtAvailable,
  isOperatingHoursOpenNow,
  isOperatingHoursWindowAvailable,
} from "@/lib/customer/operating-hours";

const detailedHours: OperatingHours = {
  mon: { periods: [{ open: "09:00", close: "13:00" }, { open: "14:00", close: "18:00" }] },
  tue: { closed: true },
  wed: { allDay: true },
  fri: { periods: [{ open: "18:00", close: "01:00" }] },
};

describe("customer operating-hours semantics", () => {
  it("normalizes legacy, closed, all-day, and multiple-period records", () => {
    expect(getOperatingHoursPeriods({ open: "09:00", close: "17:00" })).toEqual([{ open: "09:00", close: "17:00" }]);
    expect(getOperatingHoursPeriods(detailedHours.mon)).toEqual(detailedHours.mon?.periods);
    expect(getOperatingHoursPeriods(detailedHours.tue)).toEqual([]);
    expect(getOperatingHoursPeriods(detailedHours.wed)).toEqual([{ open: "00:00", close: "24:00" }]);
  });

  it("formats every weekday and every period for a Google-style weekly summary", () => {
    const formatted = formatOperatingHours(detailedHours, {
      day: (day) => ({ mon: "Monday", tue: "Tuesday", wed: "Wednesday", fri: "Friday" } as Record<string, string>)[day] ?? day,
      closed: "Closed",
      allDay: "Open 24 hours",
      unavailable: "Hours unavailable",
    });
    expect(formatted).toContain("Monday: 09:00–13:00, 14:00–18:00");
    expect(formatted).toContain("Tuesday: Closed");
    expect(formatted).toContain("Wednesday: Open 24 hours");
    expect(formatted).toContain("Friday: 18:00–01:00");
  });

  it("matches a selected day at a time and a complete period across the selected day scope", () => {
    expect(isOperatingHoursAtAvailable("10:00", detailedHours, ["mon"])).toBe(true);
    expect(isOperatingHoursAtAvailable("13:30", detailedHours, ["mon"])).toBe(false);
    expect(isOperatingHoursWindowAvailable("10:00", "12:00", detailedHours, ["mon"])).toBe(true);
    expect(isOperatingHoursWindowAvailable("13:00", "14:00", detailedHours, ["mon"])).toBe(false);
    expect(isOperatingHoursWindowAvailable("10:00", "12:00", detailedHours, ["tue"])).toBe(false);
  });

  it("handles overnight periods only when the filter explicitly allows overnight", () => {
    expect(isOperatingHoursWindowAvailable("20:00", "23:00", detailedHours, ["fri"])).toBe(true);
    expect(isOperatingHoursWindowAvailable("23:00", "01:00", detailedHours, ["fri"], { overnight: false })).toBe(false);
    expect(isOperatingHoursWindowAvailable("23:00", "01:00", detailedHours, ["fri"], { overnight: true })).toBe(true);
  });

  it("calculates Open Now from the Malaysia-local weekday and time", () => {
    expect(isOperatingHoursOpenNow({ mon: { open: "09:00", close: "18:00" } }, new Date("2026-09-07T04:00:00.000Z"))).toBe(true);
    expect(isOperatingHoursOpenNow({ mon: { open: "09:00", close: "18:00" } }, new Date("2026-09-07T12:00:00.000Z"))).toBe(false);
    expect(isOperatingHoursOpenNow(null, new Date("2026-09-07T04:00:00.000Z"))).toBe(false);
  });

  it("formats hours through formatHours with outlet copy options and fallbacks", () => {
    const formatted = formatHours(detailedHours, {
      scheduleUnavailable: "Schedule unavailable",
      closed: "Tutup",
      day: (day) => day.toUpperCase(),
    });
    expect(formatted).toContain("MON: 09:00–13:00, 14:00–18:00");
    expect(formatted).toContain("TUE: Tutup");
    expect(formatted).toContain("WED: Open 24 hours");

    expect(formatHours(null, { scheduleUnavailable: "No schedule available" })).toBe("No schedule available");
    expect(formatHours(null)).toBe("Check the outlet schedule before booking.");
  });

  it("clips a day's track to that day, carrying overnight periods across midnight", () => {
    expect(getDayTrackSegments(detailedHours, "mon")).toEqual([{ start: 540, end: 780 }, { start: 840, end: 1080 }]);
    expect(getDayTrackSegments(detailedHours, "fri")).toEqual([{ start: 1080, end: 1440 }]);
    expect(getDayTrackSegments(detailedHours, "sat")).toEqual([{ start: 0, end: 60 }]);
    expect(getDayTrackSegments(detailedHours, "tue")).toEqual([]);
    expect(getDayTrackSegments(detailedHours, "wed")).toEqual([{ start: 0, end: 1440 }]);
  });

  it("finds the next opening later today, tomorrow, or later in the week", () => {
    // 2026-11-02 is a Monday; 10:00 UTC is 18:00 in Malaysia.
    expect(getNextOpening(detailedHours, new Date("2026-11-02T05:30:00Z"))).toEqual({ day: "mon", time: "14:00", offsetDays: 0 });
    expect(getNextOpening(detailedHours, new Date("2026-11-02T10:00:00Z"))).toEqual({ day: "wed", time: "00:00", offsetDays: 2 });
    expect(getNextOpening({ thu: { open: "09:00", close: "17:00" } }, new Date("2026-11-04T10:00:00Z"))).toEqual({ day: "thu", time: "09:00", offsetDays: 1 });
    expect(getNextOpening({ tue: { closed: true } }, new Date("2026-11-02T10:00:00Z"))).toBeNull();
    expect(getNextOpening(null)).toBeNull();
  });
});
