import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_TRIP_PLACE_FILTERS } from "../trip-place-discovery";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => `${key}${values ? ` ${Object.values(values).join(" ")}` : ""}`,
  }),
}));

const { TripPlaceFilterPanel } = await import("../trip-place-filter-panel");

describe("TripPlaceFilterPanel", () => {
  it("renders the approved price, rating, availability, sort, and distance controls", () => {
    const markup = renderToStaticMarkup(
      <TripPlaceFilterPanel
        filters={DEFAULT_TRIP_PLACE_FILTERS}
        hasOrigin
        resultCount={42}
        onChange={() => undefined}
        onClear={() => undefined}
        onDone={() => undefined}
      />,
    );

    expect(markup).toContain("filters.title");
    expect(markup).toContain("filters.priceBands.free");
    expect(markup).toContain("filters.priceBands.under25");
    expect(markup).toContain("filters.ratings.fourPointFive");
    expect(markup).toContain("filters.openNow");
    expect(markup).toContain("filters.sorts.popular");
    expect(markup).toContain("filters.sorts.suggestedNewest");
    expect(markup).toContain("filters.sorts.nameDesc");
    expect(markup).toContain("1 km");
    expect(markup).toContain("2 km");
    expect(markup).toContain("5 km");
    expect(markup).toContain("filters.distanceAll");
    expect(markup).toContain("filters.results 42");
    expect(markup).toContain("filters.done");
  });

  it("disables location-dependent controls and explains the missing trip origin", () => {
    const markup = renderToStaticMarkup(
      <TripPlaceFilterPanel
        filters={{ ...DEFAULT_TRIP_PLACE_FILTERS, sort: "distance" }}
        hasOrigin={false}
        resultCount={4}
        onChange={() => undefined}
        onClear={() => undefined}
        onDone={() => undefined}
      />,
    );

    expect(markup).toContain("filters.locationRequired");
    expect(markup).toMatch(/<option[^>]+value="distance"[^>]+disabled/);
    expect(markup).toMatch(/<button[^>]+disabled[^>]*>1 km<\/button>/);
  });
});
