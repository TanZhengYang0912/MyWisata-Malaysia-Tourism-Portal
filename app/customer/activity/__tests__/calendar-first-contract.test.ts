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

  it("keeps expanded filters compact on phones and on one desktop row", () => {
    expect(calendarSource).toContain('className="grid grid-cols-2 gap-2 lg:grid-cols-7"');
    expect(calendarSource).toContain('className="col-span-2 flex min-w-0 lg:col-span-2"');
    expect(calendarSource).toContain("<DiscoverySearchField");
    expect(calendarSource).toContain('className="col-span-2 min-w-0 lg:col-span-1 h-10 rounded-xl');
    expect(calendarSource).toContain('className="col-span-2 grid grid-cols-2 gap-2 lg:col-span-2"');
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

  it("shows bookings only after their order settles and refreshes when payment status changes", () => {
    expect(calendarSource).toContain("getSettledBookingsForUser(currentUser.id)");
    expect(calendarSource).toContain('table: "orders", filter: `user_id=eq.${currentUser.id}`');
  });

  it("keeps every filtered booking reachable through the month or Other bookings", () => {
    expect(calendarSource).toContain("getItineraryGroupsOutsideMonth(itineraryGroups, monthStart)");
    expect(calendarSource).toContain('aria-label={tCustomer("ui.calendar.otherBookings")}');
    expect(calendarSource).toContain("visibleOtherItineraryGroups.map(renderItineraryCard)");
    expect(calendarSource).toContain("BookingDayDrawer date={selectedDayDate} groups={selectedDayGroups}");
    expect(calendarSource).not.toContain("itineraryGroups.map(renderItineraryCard)");
    expect(calendarSource).toContain('const shouldPromoteOtherBookings = monthItineraryGroupCount === 0 && otherItineraryGroups.length > 0;');
    expect(calendarSource).toContain('shouldPromoteOtherBookings ? "order-2 md:order-1" : "order-1"');
    expect(calendarSource).toContain('shouldPromoteOtherBookings ? "order-1 md:order-2" : "order-2"');
    expect(calendarSource).toContain("aria-hidden={shouldPromoteOtherBookings}");
  });

  it("shows the month calendar on mobile and keeps outside-month bookings labeled", () => {
    expect(calendarSource).not.toContain('<div className="hidden md:block">\n            <div className="grid grid-cols-7');
    expect(calendarSource).toContain("className={`min-h-[56px] border-b border-r border-border p-1 md:min-h-[104px] md:p-2");
    expect(calendarSource).toContain("md:hidden ${inMonth");
    expect(calendarSource).toContain('setSelectedDayKey(key)');
    expect(calendarSource).toContain('<BookingDayDrawer date={selectedDayDate} groups={selectedDayGroups}');
    expect(calendarSource).toContain("const dayGroups = inMonth ? bookingsByDay[key] || [] : [];");
    expect(calendarSource).toContain('className={`space-y-3 border-t border-border p-4 ${shouldPromoteOtherBookings');
    expect(calendarSource).not.toContain('className="hidden space-y-3 border-t border-border p-4 md:block"');
    expect(calendarSource).toContain('visibleOtherItineraryGroups.map(renderItineraryCard)');
  });

  it("links every booking in an outside-month group and searches its reference", () => {
    expect(calendarSource).toContain("group.bookings.map((booking)");
    expect(calendarSource).toContain('href={`/customer/bookings/${booking.id}`}');
    expect(calendarSource).toContain("booking.id, booking.orderId");
    expect(calendarSource).not.toContain("onClick={() => group.slotStartsAt && setSelectedDayKey");
  });

  it("limits the rendered outside-month list with shared pagination", () => {
    expect(calendarSource).toContain("const OTHER_BOOKINGS_PAGE_SIZE = 10;");
    expect(calendarSource).toContain('import { Pagination } from "@/components/shared/pagination"');
    expect(calendarSource).toContain("otherItineraryGroups.slice(");
    expect(calendarSource).toContain("pageSize={OTHER_BOOKINGS_PAGE_SIZE}");
    expect(calendarSource).toContain("const otherBookingsPageKey = JSON.stringify([scope, outletId, activityName, query, from, to, monthStart?.getTime() ?? null]);");
    expect(calendarSource).toContain("Math.min(requestedOtherBookingsPage, otherBookingsPageCount)");
    expect(calendarSource).not.toContain("setOtherBookingsPage(1)");
  });

  it("uses the shared bounded select and one activity filter option per displayed name", () => {
    expect(calendarSource).toContain('import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"');
    expect(calendarSource).toContain("getUniqueItineraryActivityNames(bookings ?? [])");
    expect(calendarSource).toContain("booking.activityName.trim() !== activityName");
    expect(calendarSource).toContain("<SelectContent className=\"max-h-[min(24rem,var(--radix-select-content-available-height))]\">");
    expect(calendarSource).toContain("activityOptions.map((name) => <SelectItem key={name} value={");
  });
});
