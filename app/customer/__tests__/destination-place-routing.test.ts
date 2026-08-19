import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  resolve(process.cwd(), "app/customer/destination/[destinationId]/page.tsx"),
  "utf8",
);

describe("federal territory destination routing", () => {
  it.each(["kuala-lumpur", "putrajaya", "labuan"])(
    "uses the shared place page for %s",
    (slug) => {
      expect(pageSource).toContain("PLACE_FIRST_DESTINATION_SLUGS");
      expect(pageSource).toContain(`"${slug}"`);
    },
  );

  it("redirects place-first destinations before rendering the legacy layout", () => {
    const guardIndex = pageSource.indexOf("PLACE_FIRST_DESTINATION_SLUGS");
    const legacyHeroIndex = pageSource.indexOf("{/* Hero */}");

    expect(guardIndex).toBeGreaterThanOrEqual(0);
    expect(pageSource).toContain("redirect(`/customer/place/${stateSlug}`)");
    expect(guardIndex).toBeLessThan(legacyHeroIndex);
  });
});
