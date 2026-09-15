import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const hubSource = readFileSync(new URL("../trip-hub-client.tsx", import.meta.url), "utf8");
const localeSources = [
  readFileSync(new URL("../../../i18n/locales/en/customer.json", import.meta.url), "utf8"),
  readFileSync(new URL("../../../i18n/locales/ms/customer.json", import.meta.url), "utf8"),
  readFileSync(new URL("../../../i18n/locales/zh-CN/customer.json", import.meta.url), "utf8"),
].map((source) => JSON.parse(source) as { ui: { trip: { openPlanner: string } } });

describe("trip hub layout contract", () => {
  it("uses the shared customer title and page shell", () => {
    expect(hubSource).toContain('import { CustomerPageShell, CustomerPageTitle } from "@/components/customer/customer-page-shell";');
    expect(hubSource).toContain("<CustomerPageTitle");
    expect(hubSource).toContain('<CustomerPageShell wide className="pt-0 sm:pt-0">');
    expect(hubSource).not.toContain("<div className=\"mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8\">");
  });

  it("uses the shared customer page container and responsive heading scale", () => {
    expect(hubSource).toContain("CustomerPageShell wide");
    expect(hubSource).toContain("description={t(\"ui.trip.description\")}");
  });

  it("keeps the trip cards readable at wide desktop sizes", () => {
    expect(hubSource).toContain("grid gap-5 sm:grid-cols-2 lg:grid-cols-3");
    expect(hubSource).toContain("rounded-2xl border border-border bg-card p-5");
    expect(hubSource).toContain("text-xl font-bold text-foreground");
  });

  it("uses a deliberate action affordance for opening a planner", () => {
    expect(hubSource).toContain("ArrowUpRight");
    expect(hubSource).toContain("group/open");
    expect(hubSource).toContain('t("ui.trip.openPlanner")');
    expect(localeSources.every((locale) => !locale.ui.trip.openPlanner.includes("→"))).toBe(true);
  });

  it("exposes detailed trip filters and a filter-specific empty state", () => {
    expect(hubSource).toContain('filterTrips, type TripFilters');
    expect(hubSource).toContain('from "@/lib/customer/trip-filters"');
    expect(hubSource).toContain('t("ui.trip.filterTitle")');
    expect(hubSource).toContain('t("ui.trip.searchPlaceholder")');
    expect(hubSource).toContain('t("ui.trip.noMatches")');
    expect(hubSource).toContain('t("ui.actions.clearFilters")');
    expect(hubSource).toContain('role="group"');
  });
});
