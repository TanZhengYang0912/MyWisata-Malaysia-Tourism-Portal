import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "app/customer/activity/[id]/activity-detail-client.tsx"),
  "utf8",
);

describe("activity detail booking layout", () => {
  it("places the shorter hero and content before the desktop booking card inside one grid", () => {
    const gridIndex = source.indexOf('className="grid items-start gap-6');
    const heroIndex = source.indexOf("h-44");
    const sectionIndex = source.indexOf('<section className="min-w-0">');
    const asideIndex = source.indexOf('<aside className="lg:sticky lg:top-24">');

    expect(gridIndex).toBeGreaterThanOrEqual(0);
    expect(heroIndex).toBeGreaterThan(gridIndex);
    expect(sectionIndex).toBeGreaterThan(heroIndex);
    expect(asideIndex).toBeGreaterThan(sectionIndex);
  });

  it("keeps the mobile fixed add-to-cart action", () => {
    expect(source).toContain("md:hidden");
    expect(source).toContain("Add to Cart");
  });
});
