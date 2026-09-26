import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const component = readFileSync(resolve(process.cwd(), "components/customer/event-calendar-dialog.tsx"), "utf8");
const styles = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

describe("customer event calendar dialog state flow", () => {
  it("keeps the date toolbar while replacing the calendar body in non-ready states", () => {
    expect(component).toContain("getCustomerCalendarUiState(loadStatus, events.length)");
    expect(component).toContain("mw-customer-calendar--status");
    expect(component).toContain("min-h-0 min-w-0 overflow-y-auto thin-scrollbar");
    expect(component).toContain('"lg:grid-cols-1"');
    expect(styles).toContain(".mw-customer-calendar--status .fc .fc-view-harness");
  });

  it("offers a retry for failed loads and a real next-range action for empty ranges", () => {
    expect(component).toContain("retryCurrentRange");
    expect(component).toContain("calendarRef.current?.getApi().next()");
    expect(component).toContain('href="/customer/explore" onClick={() => handleOpenChange(false)}');
  });

  it("provides calendar empty-state and next-range copy in every customer locale", () => {
    for (const locale of ["en", "ms", "zh-CN"]) {
      const customer = JSON.parse(readFileSync(
        resolve(process.cwd(), `app/i18n/locales/${locale}/customer.json`),
        "utf8",
      )) as { ui: { home: Record<string, string> } };

      expect(customer.ui.home.eventCalendarEmptyTitle).toBeTruthy();
      expect(customer.ui.home.eventCalendarEmptyDescription).toBeTruthy();
      expect(customer.ui.home.eventCalendarExploreAction).toBeTruthy();
      expect(customer.ui.home.eventCalendarTryNextRange).toBeTruthy();
    }
  });
});
