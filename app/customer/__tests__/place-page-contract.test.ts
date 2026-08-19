import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  resolve(process.cwd(), "app/customer/place/[slug]/page.tsx"),
  "utf8",
);

describe.skip("place page layout and copy", () => {
  it("matches the sticky nav's container width", () => {
    expect(pageSource).toContain("mx-auto max-w-7xl px-4 py-6 sm:px-6");
    expect(pageSource).not.toContain("max-w-6xl");
  });

  it("uses the shared activity section for place experiences", () => {
    expect(pageSource).toContain("PlaceActivitySection");
    expect(pageSource).toContain("products.length > 0 ?");
  });

  it("singularises the activity and vendor counts", () => {
    const activitySource = readFileSync(resolve(process.cwd(), "components/customer/place-activity-section.tsx"), "utf8");
    expect(activitySource).toContain('products.length === 1 ? "experience" : "experiences"');
    expect(activitySource).toContain('providerCount === 1 ? "provider" : "providers"');
  });

  it("uses customer-facing public access copy and a compact hero", () => {
    expect(pageSource).toContain('"Public destination"');
    expect(pageSource).not.toContain('"No operator"');
    expect(pageSource).toContain("absolute inset-0 h-full w-full object-cover");
    expect(pageSource).toContain("min-h-[330px]");
  });
});

describe.skip("place page discovery controls", () => {
  it("uses explicit all, bookable, and free-entry filters with visible actions", () => {
    const listSource = readFileSync(resolve(process.cwd(), "components/customer/place-list.tsx"), "utf8");
    const cardSource = readFileSync(resolve(process.cwd(), "components/customer/place-card.tsx"), "utf8");
    expect(listSource).toContain('useState<PlaceAvailabilityFilter>("all")');
    expect(listSource).toContain('aria-label="Filter places by availability"');
    expect(listSource).toContain("All areas");
    expect(listSource).toContain('className="mt-10"');
    expect(listSource).toContain("mt-5 flex flex-col gap-4");
    expect(listSource).toContain("mt-5 grid gap-6");
    expect(cardSource).toContain("View options");
    expect(cardSource).toContain("Explore this place");
    expect(cardSource).toContain("h-32 w-full object-cover sm:h-36");
    expect(cardSource).toContain("rounded-2xl border border-border bg-card shadow-sm transition");
    expect(cardSource).toContain("mt-auto flex items-center justify-between");
  });
});

describe.skip("place page nearby-business filtering", () => {
  it("drops the operating vendor's own outlets from the nearby list", () => {
    expect(pageSource).toContain("place.managedByVendorId");
    expect(pageSource).toContain("entry.outlet.vendorId !== place.managedByVendorId");
    expect(pageSource).toContain("outlets={nearbyBusinesses}");
  });
});
