import { describe, it, expect } from "vitest";
import { INTEREST_OPTIONS, INTEREST_SLUGS } from "@/backend/domains/preferences";

// The seeded categories.slug set (supabase/seed.sql + migration 040's nightlife).
// Every interest slug MUST be a real category slug, or interest matching silently
// scores nothing — the exact bug this vocabulary unification fixes.
const SEEDED_CATEGORY_SLUGS = [
  "food", "nature", "cultural", "adventure", "wellness", "shopping", "family", "nightlife",
];

describe("interest vocabulary", () => {
  it("every interest slug maps to a seeded category", () => {
    for (const slug of INTEREST_SLUGS) {
      expect(SEEDED_CATEGORY_SLUGS).toContain(slug);
    }
  });

  it("labels are unique and slug count matches", () => {
    const labels = INTEREST_OPTIONS.map((o) => o.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(INTEREST_SLUGS.length).toBe(SEEDED_CATEGORY_SLUGS.length);
  });
});
