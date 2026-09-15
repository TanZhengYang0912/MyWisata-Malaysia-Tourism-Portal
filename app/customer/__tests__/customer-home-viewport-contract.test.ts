import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const homeSource = readFileSync(
  resolve(process.cwd(), "app/customer/customer-home-client.tsx"),
  "utf8",
);

describe("customer home first viewport", () => {
  it("budgets the desktop hero below the customer navigation", () => {
    expect(homeSource).toContain("lg:h-auto");
    expect(homeSource).toContain("lg:min-h-[calc(100svh-64px)]");
    expect(homeSource).toContain("lg:flex");
    expect(homeSource).toContain("lg:flex-col");
  });

  it("keeps the Explore Destinations carousel inside that desktop budget", () => {
    expect(homeSource).toContain("lg:flex-none");
    expect(homeSource).toContain("lg:min-h-[500px]");
    expect(homeSource).toContain("lg:h-[500px]");
    expect(homeSource).toContain("lg:h-[380px]");
    expect(homeSource).toContain("lg:max-w-[560px]");
    expect(homeSource).toContain("lg:w-[88%]");
    expect(homeSource).toContain("lg:h-full lg:aspect-auto");
    expect(homeSource).toContain("lg:mt-10");
    expect(homeSource).toContain("lg:pt-8");
    expect(homeSource).toContain("lg:h-44");
    expect(homeSource).toContain('aria-label={t("ui.home.destinationCarousel")');
  });

  it("exposes keyboard-accessible controls beside View all for the destination rail", () => {
    expect(homeSource).toContain("ChevronLeft");
    expect(homeSource).toContain("ChevronRight");
    expect(homeSource).toContain('aria-label={t("ui.map.previous")');
    expect(homeSource).toContain('aria-label={t("ui.map.next")');
    expect(homeSource).toContain("destinationRailRef");
    expect(homeSource).toContain('behavior: "smooth"');
  });

  it("keeps the For You rail visible with a cold-start fallback and a full-page link", () => {
    expect(homeSource).toContain("recommended.length > 0 ? recommended.slice(0, 4) : popular.slice(0, 4)");
    expect(homeSource).toContain('t("ui.home.popularExperiences")');
    expect(homeSource).toContain('href="/customer/for-you"');
    expect(homeSource).toContain('t("ui.actions.viewAll")');
  });

  it("does not expose vendor business-type translation keys in Featured Partners cards", () => {
    expect(homeSource).not.toContain("ui.vendor.businessTypes");
    expect(homeSource).not.toContain("customer:ui.vendor");
    expect(homeSource).toContain('t("ui.home.vendorDescription", { location })');
  });

  it("offers a customer event calendar popup from the home route", () => {
    expect(homeSource).toContain("EventCalendarDialog");
    expect(homeSource).toContain('t("ui.home.viewEventCalendar")');
    expect(homeSource).toContain('aria-label={t("ui.home.eventCalendar")');
  });
});
