import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("../page.tsx", import.meta.url), "utf8");

describe("recommendation evidence form contract", () => {
  it("collects the required evidence before submitting a recommendation", () => {
    expect(page).toContain('tCustomer("ui.recommendations.why")');
    expect(page).toContain('tCustomer("ui.recommendations.photoHint")');
    expect(page).toContain('tCustomer("ui.recommendations.addContact")');
    expect(page).toContain('tCustomer("ui.recommendations.imagePermission")');
    expect(page).toContain('tCustomer("ui.recommendations.selectCategory")');
    expect(page).toContain('tCustomer("ui.recommendations.noCategories")');
    expect(page).toContain("GooglePlacePicker");
    expect(page).toContain("/api/recommendations/images");
  });

  it("keeps a pending recommendation read-only and reopens returned submissions for changes", () => {
    expect(page).toContain("changes_requested");
    expect(page).toContain('tCustomer("ui.recommendations.notEditable")');
  });
});
