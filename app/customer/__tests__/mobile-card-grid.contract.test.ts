import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

// Product, vendor and event-partner cards sit two per row on phones (owner decision 2026-10-26).
const CARD_GRIDS: Array<[file: string, grids: string[]]> = [
  ["app/customer/customer-home-client.tsx", ["grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4"]],
  ["app/customer/explore/explore-client.tsx", ["grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4"]],
  ["app/customer/activity/[id]/activity-detail-client.tsx", ["mt-5 grid grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-4"]],
  ["app/customer/search/search-client.tsx", ["grid grid-cols-2 items-stretch gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4"]],
  // The Home event-partner row is a card carousel, which pages two cards at a time on phones (.mw-card-carousel).
  ["components/customer/event-partners-section.tsx", ["<CardCarousel "]],
  ["app/customer/events/promotion-campaigns-client.tsx", ["grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4"]],
];

describe("mobile card grids", () => {
  it.each(CARD_GRIDS)("lays out cards two per row on phones in %s", (file, grids) => {
    const source = read(file);
    for (const grid of grids) expect(source).toContain(grid);
    // No card grid may fall back to a single column on phones.
    expect(source).not.toMatch(/grid grid-cols-1[^"]*sm:grid-cols-2/);
    expect(source).not.toMatch(/className="(?:mt-5 )?grid (?:items-stretch )?gap-\d+ sm:grid-cols-2/);
  });
});
