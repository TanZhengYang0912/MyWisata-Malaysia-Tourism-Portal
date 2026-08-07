import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const seedSource = readFileSync(resolve(process.cwd(), "scripts/seed-remote-demo.mjs"), "utf8");

describe("public place seed contract", () => {
  it("keeps public heritage walks free and non-bookable on reseed", () => {
    for (const slug of [
      "george-town-story-walk-penang",
      "jonker-walk-heritage-trail",
      "merdeka-square-heritage-walk",
    ]) {
      expect(seedSource).toContain(`'${slug}'`);
    }
    expect(seedSource).toContain("const isPublicPlace = Boolean(placeBound && PUBLIC_PLACE_SLUGS.has(slug));");
    expect(seedSource).toContain("requires_booking: isPublicPlace ? false : requiresBooking");
    expect(seedSource).toContain("base_price: isPublicPlace ? 0 : basePrice + ((i % 5) * 2)");
  });

  it("does not make every place-bound activity free", () => {
    expect(seedSource).toContain("'penang-national-park-monkey-beach-trek'");
    expect(seedSource).toContain("requires_booking: isPublicPlace ? false : requiresBooking");
  });
});
