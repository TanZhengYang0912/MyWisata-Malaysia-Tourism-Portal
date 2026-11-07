import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Super Admin narrow dialogs and detail values", () => {
  it.each([
    "components/admin/confirm-dialog.tsx",
    "components/admin/vendor-reason-modal.tsx",
  ])("bounds %s to the dynamic viewport and stacks its actions on phones", (path) => {
    const modalSource = source(path);
    expect(modalSource).toContain("max-h-[calc(100dvh-2rem)]");
    expect(modalSource).toContain("overflow-y-auto overscroll-contain");
    expect(modalSource).toContain("flex flex-col gap-2 sm:flex-row sm:justify-end");
  });

  it("uses a dynamic scrolling viewport for user and vendor drawers", () => {
    const userDrawer = source("components/admin/user-management-drawer.tsx");
    const vendorPage = source("app/admin/vendors/page.tsx");

    expect(userDrawer).toContain("max-h-[calc(100dvh-2rem)]");
    expect(userDrawer).toContain("break-all font-semibold text-foreground");
    expect(vendorPage).toContain("max-h-[calc(100dvh-2rem)]");
    expect(vendorPage).toContain("break-all text-xs text-foreground");
  });

  it("keeps sponsored impact confirmation content and actions reachable", () => {
    const dialogSource = source("components/admin/sponsored-placements/impact-dialog.tsx");
    expect(dialogSource).toContain("max-h-[90dvh]");
    expect(dialogSource).toContain("overflow-y-auto overscroll-contain");
    expect(dialogSource).toContain("flex flex-col gap-2 sm:flex-row sm:justify-end");
    expect(dialogSource).toContain("break-words font-medium text-foreground");
  });

  it.each([
    "app/admin/event-promotions/[id]/page.tsx",
    "app/admin/event-registrations/[id]/page.tsx",
    "app/admin/promotion-campaigns/page.tsx",
  ])("bounds %s poster previews to the dynamic viewport", (path) => {
    const pageSource = source(path);
    expect(pageSource).toContain("max-h-[calc(100dvh-2rem)]");
    expect(pageSource).toContain("max-h-[calc(100dvh-8rem)]");
  });

  it("wraps recommendation and withdrawal review details at narrow widths", () => {
    const recommendation = source("components/admin/recommendation-detail-view.tsx");
    const withdrawal = source("components/admin/withdrawal-review-detail.tsx");

    expect(recommendation).toContain("xl:max-h-[calc(100dvh-3rem)]");
    expect(recommendation).toContain("break-all text-xs text-muted-foreground");
    expect(withdrawal).toContain("grid grid-cols-1 gap-3 text-sm sm:grid-cols-2");
    expect(withdrawal).toContain("break-all text-muted-foreground");
  });
});
