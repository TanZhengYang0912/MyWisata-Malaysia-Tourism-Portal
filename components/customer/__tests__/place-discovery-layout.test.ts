import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workspace = process.cwd();
const read = (file: string) => readFileSync(resolve(workspace, file), "utf8");

describe("place discovery section layout", () => {
  it("gives Places to visit a destination-first hierarchy and stable grid contract", () => {
    const source = read("components/customer/place-list.tsx");
    const card = read("components/customer/place-card.tsx");

    expect(source).toContain('aria-labelledby="places-to-visit-heading"');
    expect(source).toContain('t("ui.explore.eyebrow")');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain("parsePlaceAreaIds");
    expect(source).toContain("AreaPicker");
    expect(source).toContain('searchParams.getAll("area")');
    // One POI per row on phones, two on desktop; each card's own height (no stretched blank space).
    expect(source).toContain("grid grid-cols-1 items-start gap-6 lg:grid-cols-2");
    expect(card).toContain("<PlaceActivityCard");
    expect(card).not.toContain('t("ui.place.cardFallback")');
  });

  it("opens the area filter inside the screen: from the Location row's left edge on phones, under the button from lg", () => {
    const source = read("components/customer/place-list.tsx");

    expect(source).toContain('<div className="lg:relative" aria-label={t("ui.place.filterAreaLabel")}>');
    expect(source).toContain('className="absolute left-0 z-20 mt-2 w-[min(20rem,calc(100vw-3rem))] rounded-2xl border border-border bg-card p-3 shadow-xl lg:left-auto lg:right-0"');
    expect(source).toContain('className="relative flex flex-wrap items-center gap-1.5 lg:border-l lg:border-border lg:pl-4"');
  });

  it("gives Nearby businesses a local-partner summary and recoverable empty state", () => {
    const source = read("components/customer/nearby-outlets.tsx");

    expect(source).toContain('t("ui.nearbyOutlets.eyebrow"');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('t("ui.actions.clearFilters")');
    expect(source).toContain("focus-visible:ring-2");
  });
});
