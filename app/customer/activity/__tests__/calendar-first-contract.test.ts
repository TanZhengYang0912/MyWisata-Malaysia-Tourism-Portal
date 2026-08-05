import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");
const activitySource = read("app/customer/activity/page.tsx");
const calendarSource = read("app/customer/calendar/page.tsx");

describe("calendar-first My Activity flow", () => {
  it("uses Calendar as the primary activity view", () => {
    expect(activitySource).toContain("parseActivityTab");
    expect(activitySource).toContain("<CustomerCalendarPage");
    expect(activitySource).not.toContain("Upcoming itinerary");
  });

  it("does not put a separate activity switcher above the calendar", () => {
    expect(activitySource).not.toContain('aria-label="My activity views"');
  });

  it("keeps the full calendar shell ahead of optional controls", () => {
    expect(calendarSource).toContain("const [filtersOpen, setFiltersOpen] = useState(false)");
    expect(calendarSource).toContain('aria-expanded={filtersOpen}');
    expect(calendarSource).toContain('id="calendar-filters"');
    expect(calendarSource).toContain('aria-label="Booking calendar"');
    expect(calendarSource).toContain("Orders & receipts");
    expect(calendarSource).not.toContain("viewCopy.description");
    expect(calendarSource).not.toContain("{viewCopy.historyAction}");
    expect(calendarSource).not.toContain("Find an experience");
    expect(calendarSource).toContain('aria-label="Calendar actions"');
    expect(calendarSource).toContain("min-h-[104px]");
    expect(calendarSource).toContain('placeholder="Search bookings"');
    expect(calendarSource).not.toContain("stats.map");
  });

  it("lets customers choose a calendar month and year directly", () => {
    expect(calendarSource).toContain('aria-haspopup="dialog"');
    expect(calendarSource).toContain('aria-controls="calendar-month-picker"');
    expect(calendarSource).toContain("Choose month");
    expect(calendarSource).toContain("Choose year");
    expect(calendarSource).toContain("January");
    expect(calendarSource).toContain("December");
  });
});
