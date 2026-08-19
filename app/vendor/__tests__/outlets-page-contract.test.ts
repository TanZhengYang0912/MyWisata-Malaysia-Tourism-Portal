import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "app/vendor/outlets/page.tsx"), "utf8");

describe("vendor outlets management affordances", () => {
  it("keeps page selection in the result summary row", () => {
    expect(source).toContain("aria-label={t('ui.outlets.selectCurrentPage')}");
    expect(source).toContain("t('ui.outlets.selectCurrentPage')");
    expect(source).not.toContain("Select current page");
  });

  it("makes outlet actions and empty listing states explicit", () => {
    expect(source).toContain("t('ui.outlets.viewDetails')");
    expect(source).toContain("t('ui.outlets.editOutlet')");
    expect(source).toContain("t('ui.outlets.noListings')");
    expect(source).toContain("t('ui.outlets.manageListings')");
  });

  it("only renders pagination when there is more than one page", () => {
    expect(source).toContain("pagination.totalPages > 1");
  });

  it("centers outlet details as a modal instead of a right-side drawer", () => {
    expect(source).toContain(".fixed.inset-0.z-40");
    expect(source).toContain("justify-content: center");
    expect(source).toContain(".fixed.inset-0.z-40 > aside");
    expect(source).toContain("position: relative");
    expect(source).toContain("max-height: 90vh");
  });
});
