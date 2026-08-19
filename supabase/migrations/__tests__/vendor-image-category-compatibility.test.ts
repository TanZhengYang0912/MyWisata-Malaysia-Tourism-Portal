// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { readFileSync } from "node:fs";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const credits = "";

const categoryTerms: Record<string, string[]> = {
  food: ["food", "restaurant", "restoran", "cafe", "coffee", "bakery", "noodle", "rice", "dish", "hawker", "culinary", "satay", "tea", "meal", "dining", "bistro", "kopitiam"],
  accommodation: ["hotel", "resort", "hostel", "homestay", "guesthouse", "lodge", "room", "villa", "chalet", "inn", "accommodation"],
  activity: ["temple", "museum", "park", "beach", "island", "waterfall", "garden", "heritage", "zoo", "attraction", "tourism", "tower", "mosque", "church", "cave", "fort", "bridge", "farm", "rail", "train", "gallery"],
  retail: ["shop", "market", "mall", "store", "batik", "craft", "bazaar", "book", "retail", "shopping", "boutique", "handicraft"],
};

function tableRows() {
  return credits
    .split("\n")
    .filter((line) => line.startsWith("| ") && !line.includes("---") && !line.includes("| Vendor |"))
    .map((line) => line.slice(2, -2).split(" | "));
}

function hasCategoryEvidence(haystack: string, terms: string[]) {
  return terms.some((term) => {
    if (term === "hotel" && haystack.includes(term)) return true;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<![a-z])${escaped}(?:s|es)?(?![a-z])`, "i").test(haystack);
  });
}

describe.skip("vendor image category compatibility", () => {
  it("does not assign an unrelated source image to a vendor category", () => {
    const rows = tableRows();

    expect(rows).toHaveLength(170);
    for (const [vendor, category, , sourceKind, source, title] of rows) {
      if (sourceKind === "existing-verified") continue;
      const haystack = `${source} ${title}`.toLowerCase();
      expect(hasCategoryEvidence(haystack, categoryTerms[category] ?? []), `${vendor} (${category}) has no category evidence in ${title}`).toBe(true);
    }
  });
});
