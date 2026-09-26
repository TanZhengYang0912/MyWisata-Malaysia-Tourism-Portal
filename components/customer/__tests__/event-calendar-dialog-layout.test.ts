import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "components/customer/event-calendar-dialog.tsx"),
  "utf8",
);
const styles = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

describe("event calendar dialog layout", () => {
  it("keeps the calendar dialog wider than the shared small-dialog default on desktop", () => {
    expect(source).toContain("sm:!max-w-[1180px]");
  });

  it("uses a readable weekly list for overlapping sessions and compact month cards", () => {
    expect(source).toContain('right: "dayGridMonth,listWeek,listMonth"');
    expect(source).toContain('listWeek: t("ui.home.week")');
    expect(source).toContain('listMonth: t("ui.home.agenda")');
    expect(source).not.toContain('list: t("ui.home.agenda")');
    expect(source).toContain('arg.view.type === "dayGridMonth"');
  });

  it("constrains the dialog and scrolls its title and calendar content together", () => {
    expect(source).toContain("h-[min(92svh,880px)]");
    expect(source).toContain("grid-rows-[minmax(0,1fr)]");
    expect(source).toContain("min-h-0 min-w-0 overflow-y-auto thin-scrollbar");
    expect(source).not.toContain("lg:overflow-y-auto");
    expect(source).toContain("min-w-0 shrink-0 p-4 sm:p-6");
  });

  it("makes the shared dialog scroll affordance visible", () => {
    expect(source).toContain('className="min-h-0 min-w-0 overflow-y-auto thin-scrollbar"');
    expect(styles).toMatch(/\.thin-scrollbar\s*\{[^}]*scrollbar-width:\s*thin;[^}]*scrollbar-color:/);
  });

  it("opens a crowded month date as a full day list instead of a floating popover", () => {
    expect(source).toContain('moreLinkClick="listDay"');
  });

  it("keeps event details in dialog flow at every breakpoint", () => {
    expect(source).not.toContain("lg:sticky");
    expect(source).not.toContain('className="sticky top-0"');
  });

  it("fits day-list columns and event text inside a phone-width calendar", () => {
    expect(styles).toMatch(/\.mw-customer-calendar \.fc \.fc-list-table\s*\{[^}]*table-layout:\s*fixed;[^}]*width:\s*100%;[^}]*\}/);
    expect(styles).toMatch(/\.mw-customer-calendar \.fc \.fc-list-table tr:first-child > \*:first-child\s*\{[^}]*width:\s*7rem;[^}]*\}/);
    expect(styles).toMatch(/\.mw-customer-calendar \.fc \.fc-list-table tr:first-child > \*:nth-child\(2\)\s*\{[^}]*width:\s*1\.5rem;[^}]*\}/);
    expect(styles).toMatch(/\.mw-customer-calendar \.fc \.fc-list-event-title \.mw-calendar-event-title\s*\{(?=[^}]*white-space:\s*normal;)(?=[^}]*overflow-wrap:\s*anywhere;)[^}]*\}/);
  });

  it("keeps the mobile details panel after the full calendar in the scroll flow", () => {
    expect(source).toContain("flex min-w-0 flex-col lg:grid");
    expect(source).toContain("lg:grid");
    expect(source).toContain("min-w-0 shrink-0 p-4 sm:p-6");
    expect(source.indexOf('<section className="min-w-0 shrink-0 p-4 sm:p-6"')).toBeLessThan(
      source.indexOf('<aside className="min-h-0 border-t border-border bg-card/70'),
    );
  });
});
