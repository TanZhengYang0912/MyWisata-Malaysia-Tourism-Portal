import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const priceSurfaces = [
  "components/customer/activity-card.tsx",
  "components/customer/place-activity-section.tsx",
  "components/customer/sponsored-partner-rail.tsx",
  "components/guest/guest-catalogue.tsx",
  "components/demo-map/story-map.tsx",
  "components/demo-map/discovery-pin-preview.tsx",
  "app/customer/search/search-client.tsx",
  "app/customer/destination/[destinationId]/page.tsx",
  "app/customer/activity/[id]/activity-detail-client.tsx",
  "app/customer/experience/[experienceId]/experience-booking-sidebar.tsx",
  "app/customer/vendor/[vendorId]/page.tsx",
];

describe("reference price discovery surfaces", () => {
  it.each(priceSurfaces)("uses the shared selected-currency price in %s", (file) => {
    const source = readFileSync(resolve(process.cwd(), file), "utf8");

    expect(source).toContain('from "@/components/shared/reference-price"');
    expect(source).toContain("<ReferencePrice");
  });
});
