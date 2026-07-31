import { describe, it, expect } from "vitest";
import { INTEREST_OPTIONS, INTEREST_SLUGS } from "@/backend/domains/preferences";

const CANONICAL_CATEGORY_SLUGS = ["food", "activity", "accommodation", "retail"];

describe("interest vocabulary", () => {
  it("every interest slug maps to a seeded category", () => {
    for (const slug of INTEREST_SLUGS) {
      expect(CANONICAL_CATEGORY_SLUGS).toContain(slug);
    }
  });

  it("labels are unique and slug count matches", () => {
    const labels = INTEREST_OPTIONS.map((o) => o.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(INTEREST_SLUGS.length).toBe(CANONICAL_CATEGORY_SLUGS.length);
  });
});
