import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  resolve(process.cwd(), "app/customer/place/[slug]/page.tsx"),
  "utf8",
);

describe("place page layout and copy", () => {
  it("matches the sticky nav's container width", () => {
    expect(pageSource).toContain("mx-auto max-w-7xl px-4 py-6 sm:px-6");
    expect(pageSource).not.toContain("max-w-6xl");
  });

  it("keeps admission separate from the shared activity section", () => {
    expect(pageSource).toContain("PlaceActivitySection");
    expect(pageSource).toContain("PlaceAdmissionSection");
    expect(pageSource).toContain('relation === "admission"');
    expect(pageSource).toContain("activities.length > 0");
    expect(pageSource).not.toContain("products.length > 0 ?");
  });

  it("singularises the activity and vendor counts", () => {
    const activitySource = readFileSync(resolve(process.cwd(), "components/customer/place-activity-section.tsx"), "utf8");
    expect(activitySource).toContain('t("ui.place.activityCount"');
    expect(activitySource).toContain("count: products.length");
    expect(activitySource).toContain('t("ui.place.vendorCount"');
    expect(activitySource).toContain("count: providerCount");
  });

  it("uses localised labels for every activity filter instead of rendering translation keys", () => {
    const activitySource = readFileSync(resolve(process.cwd(), "components/customer/place-activity-section.tsx"), "utf8");
    expect(activitySource).toContain('key: "ui.placeActivity.filters.all"');
    expect(activitySource).toContain('key: "ui.placeActivity.filters.guideService"');
    expect(activitySource).not.toContain("fallback:");
  });

  it("uses customer-facing access copy, omits empty operator metadata, and keeps a compact hero", () => {
    expect(pageSource).toContain('t("ui.place.noGate")');
    expect(pageSource).toContain("{operator &&");
    expect(pageSource).not.toContain('t("ui.place.noOperator")');
    expect(pageSource).toContain("absolute inset-0 h-full w-full object-cover");
    expect(pageSource).toContain("min-h-[330px]");
  });

  it("localizes known state labels without a public operator fallback", () => {
    expect(pageSource).toContain("getMalaysiaStateTranslationKey");
    expect(pageSource).not.toContain("noOperator");
    expect(pageSource).not.toContain('?? "Open destination"');
  });
});

describe("place page discovery controls", () => {
  it("uses explicit all, bookable, and free-entry filters with visible actions", () => {
    const listSource = readFileSync(resolve(process.cwd(), "components/customer/place-list.tsx"), "utf8");
    const cardSource = readFileSync(resolve(process.cwd(), "components/customer/place-card.tsx"), "utf8");
    expect(listSource).toContain('useState<PlaceAvailabilityFilter>("all")');
    expect(listSource).toContain('ui.place.filterAvailabilityLabel');
    expect(listSource).toContain('t("ui.place.allAreas"');
    expect(listSource).toContain('className="mt-14"');
    expect(listSource).toContain("mt-6 rounded-2xl");
    expect(listSource).toContain("mt-6 grid items-stretch gap-5");
    expect(cardSource).toContain('t("ui.outletMenu.chooseOptions"');
    expect(cardSource).toContain('t("ui.actions.viewDetails")');
    expect(cardSource).toContain('t("ui.place.explorePlace"');
    expect(cardSource).toContain("h-48 shrink-0 overflow-hidden bg-secondary sm:h-52");
    expect(cardSource).toContain("rounded-[1.5rem] border border-border bg-card shadow-sm transition");
    expect(cardSource).toContain("mt-auto flex items-center justify-between");
  });
});

describe("place page nearby-business filtering", () => {
  it("drops the operating vendor's own outlets from the nearby list", () => {
    expect(pageSource).toContain("place.managedByVendorId");
    expect(pageSource).toContain("entry.outlet.vendorId !== place.managedByVendorId");
    expect(pageSource).toContain("outlets={nearbyBusinesses}");
  });
});
