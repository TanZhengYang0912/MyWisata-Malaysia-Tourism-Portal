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
    expect(source).toContain("items-stretch");
    expect(card).toContain("group-hover:scale-105");
    expect(card).toContain("line-clamp-2");
    expect(card).toContain("min-h-[390px]");
  });

  it("gives Nearby businesses a local-partner summary and recoverable empty state", () => {
    const source = read("components/customer/nearby-outlets.tsx");

    expect(source).toContain('t("ui.nearbyOutlets.eyebrow"');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain("min-h-[96px]");
    expect(source).toContain('t("ui.actions.clearFilters")');
    expect(source).toContain("focus-visible:ring-2");
  });
});
