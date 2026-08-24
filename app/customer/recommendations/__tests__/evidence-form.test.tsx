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

  it("uses exclusive canonical groups and stable detail links", () => {
    expect(page).toContain("groupRecommendations");
    expect(page).toContain("groups.action_required");
    expect(page).toContain("groups.in_review");
    expect(page).toContain("groups.decided");
    expect(page).toContain("groups.converted");
    expect(page).toContain('href={`/customer/recommendations/${r.id}`}');
    expect(page).not.toContain('r.status === "pending" || r.status === "changes_requested"');
    expect(page).not.toContain('r.status !== "pending"');
  });

  it("warns before replacing the oldest selected photos", () => {
    expect(page).toContain("allowRecommendationImageSelection");
    expect(page).toContain("replacementConfirmedRef");
    expect(page).toContain('tCustomer("ui.recommendations.photoReplacementConfirm")');
    expect(page).toContain("event.preventDefault()");
  });
});
