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
    expect(calendarSource).toContain('aria-label={tCustomer("ui.booking.calendar"');
    expect(calendarSource).toContain('tCustomer("ui.labels.orders")');

    expect(calendarSource).not.toContain("ui.map.searchExperience");
    expect(calendarSource).toContain('aria-label={tCustomer("ui.calendar.actions")}');
    expect(calendarSource).toContain("min-h-[104px]");
    expect(calendarSource).toContain('placeholder={tCustomer("ui.calendar.searchBookings")}');
    expect(calendarSource).not.toContain("stats.map");
  });

  it("lets customers choose a calendar month and year directly", () => {
    expect(calendarSource).toContain('aria-haspopup="dialog"');
    expect(calendarSource).toContain('aria-controls="calendar-month-picker"');
    expect(calendarSource).toContain('tCustomer("ui.calendar.chooseYear")');
    expect(calendarSource).toContain('Array.from({ length: 12 }');
    expect(calendarSource).toContain('month: "long"');
    expect(calendarSource).toContain("selectCalendarMonth");
    expect(calendarSource).toContain("monthOptions.map");
  });

  it("derives the calendar scope from the URL instead of passing props to a route page", () => {
    expect(calendarSource).toContain("useSearchParams");
    expect(calendarSource).toContain('isActivityHistory(searchParams.get("history"))');
    expect(activitySource).not.toContain("initialScope=");
  });
});
