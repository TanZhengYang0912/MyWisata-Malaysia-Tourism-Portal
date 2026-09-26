import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(resolve(process.cwd(), "app/api/customer/event-calendar/route.ts"), "utf8");
const component = readFileSync(resolve(process.cwd(), "components/customer/event-calendar-dialog.tsx"), "utf8");
const styles = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

describe("customer calendar live-data contract", () => {
  it("scrolls the title with the calendar instead of pinning it above an inner scroller", () => {
    const scrollRegionIndex = component.indexOf('<div className="min-h-0 min-w-0 overflow-y-auto thin-scrollbar">');
    const headerIndex = component.indexOf("<DialogHeader");

    expect(scrollRegionIndex).toBeGreaterThanOrEqual(0);
    expect(scrollRegionIndex).toBeLessThan(headerIndex);
    expect(component).not.toContain("lg:overflow-y-auto");
    expect(component).not.toContain("lg:sticky lg:top-0");
  });

  it("projects calendar events from the authoritative booking-slot query", () => {
    expect(route).toContain('.from("booking_slots")');
    expect(route).toContain("toCustomerCalendarEvents(records, now)");
    expect(route).not.toContain("buildCustomerCalendarPreviewEvents");
    expect(route).not.toContain("shouldUseCustomerCalendarPreview");
  });

  it("does not render preview sessions or preview-only states", () => {
    expect(component).not.toContain("isPreview");
    expect(component).not.toContain("eventCalendarPreview");
    expect(styles).not.toContain("mw-calendar-event--preview");

    for (const locale of ["en", "ms", "zh-CN"]) {
      const customer = JSON.parse(readFileSync(
        resolve(process.cwd(), `app/i18n/locales/${locale}/customer.json`),
        "utf8",
      )) as { ui: { home: Record<string, string> } };

      expect(Object.keys(customer.ui.home).filter((key) => key.startsWith("eventCalendarPreview"))).toEqual([]);
    }
  });

  it("renders the selected event cover accessibly and handles missing images", () => {
    expect(component).toContain("selectedProps?.image");
    expect(component).toContain("alt={selectedEvent.title}");
    expect(component).toContain("onError");
    expect(component).toContain("ImageOff");
  });

  it("opens in Agenda, preselects the earliest fetched event, and keeps selected events legible", () => {
    expect(component).toContain('initialView="listMonth"');
    expect(component).toContain("getEarliestCustomerCalendarEvent(nextEvents)");
    expect(component).toContain("selectedEventId === arg.event.id");
    expect(component).toContain("mw-calendar-event--selected");
    expect(styles).toContain("--fc-event-text-color: var(--foreground)");
    expect(styles).not.toContain("opacity: 0.88");
  });

  it("registers FullCalendar's named timezone implementation for Malaysia event times", () => {
    expect(component).toContain('import luxon3Plugin from "@fullcalendar/luxon3"');
    expect(component).toContain("plugins={[luxon3Plugin, dayGridPlugin, timeGridPlugin, listPlugin]}");
  });

  it("labels accommodation entries by stay date in each customer locale", () => {
    expect(component).toContain("selectedProps.isAccommodation");
    expect(component).toContain('t("ui.home.stayDate")');
    expect(component).toContain("formatDate(selectedEvent.start, locale)");
    expect(component).toContain('"mw-calendar-event--accommodation"');
    expect(component).toContain('allDayText={t("ui.home.stayDate")}');
    expect(component).toContain("props.isAccommodation && !isListView");
    expect(styles).not.toContain(".fc-list-event.mw-calendar-event--accommodation .fc-list-event-time");

    const translations: Record<string, string> = {
      en: "Stay date",
      ms: "Tarikh penginapan",
      "zh-CN": "住宿日期",
    };

    for (const [locale, expected] of Object.entries(translations)) {
      const customer = JSON.parse(readFileSync(
        resolve(process.cwd(), `app/i18n/locales/${locale}/customer.json`),
        "utf8",
      )) as { ui: { home: Record<string, string> } };

      expect(customer.ui.home.stayDate).toBe(expected);
    }
  });

});
