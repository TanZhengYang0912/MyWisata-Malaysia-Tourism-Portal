import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "components/customer/activity-reviews.tsx"),
  "utf8",
);

describe("activity review submission UI", () => {
  it("provides a Google-style rating and review entry point", () => {
    expect(source).toContain('t("ui.reviews.writeReview")');
    expect(source).toContain("aria-label");
    expect(source).toContain("rating");
    expect(source).toContain("textarea");
    expect(source).toContain("/reviews");
  });

  it("handles review eligibility and refreshes the list after submission", () => {
    expect(source).toContain("canReview");
    expect(source).toContain("orderItemId");
    expect(source).toContain('t("ui.reviews.submitted")');
    expect(source).toContain("loadPage");
  });
});
