import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("../page.tsx", import.meta.url), "utf8");

describe("recommendation evidence form contract", () => {
  it("collects the required evidence before submitting a recommendation", () => {
    expect(page).toContain("Why do you recommend this place?");
    expect(page).toContain("Add 1 to 5 photos");
    expect(page).toContain("Add at least one contact method");
    expect(page).toContain("I own these images or have permission to publish them");
    expect(page).toContain("Select a recommendation category.");
    expect(page).toContain("No recommendation categories are available. Please contact support.");
    expect(page).toContain("GooglePlacePicker");
    expect(page).toContain("/api/recommendations/images");
  });

  it("keeps a pending recommendation read-only and reopens returned submissions for changes", () => {
    expect(page).toContain("changes_requested");
    expect(page).toContain("Pending recommendations cannot be edited");
  });
});
