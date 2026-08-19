import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "components/vendor/compact-filter-bar.tsx"), "utf8");

describe("compact vendor filter bar accessibility", () => {
  it("labels the search field and select controls", () => {
    expect(source).toContain("aria-label={placeholder}");
    expect(source).toContain("aria-label={select.placeholder}");
  });

  it("marks filter icons as decorative", () => {
    expect(source).toContain('<Search size={16} aria-hidden="true"');
    expect(source).toContain('<SlidersHorizontal size={16} aria-hidden="true"');
  });
});
