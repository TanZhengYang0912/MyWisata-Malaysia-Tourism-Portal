import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

const FILTER_SURFACES = [
  "app/admin/catalogue/page.tsx",
  "app/admin/vendors/page.tsx",
  "app/admin/users/page.tsx",
  "app/admin/kyc/page.tsx",
  "app/admin/withdrawals/page.tsx",
  "app/admin/refunds/page.tsx",
  "app/admin/recommendations/page.tsx",
  "app/admin/support/page.tsx",
  "app/admin/chat-reports/page.tsx",
  "app/admin/affiliate/page.tsx",
  "app/admin/reports/payouts/page.tsx",
  "components/admin/staff-conduct-panel.tsx",
] as const;

describe("admin filter consistency contract", () => {
  it("keeps every scoped admin surface on the shared filter vocabulary", () => {
    for (const file of FILTER_SURFACES) {
      const source = read(file);
      expect(
        /AdminFilterBar|AdminSegmentedFilter|adminFilterControlClassName|rounded-xl border border-border bg-background/.test(source),
        `${file} must use shared filter presentation`,
      ).toBe(true);
    }
  });

  it("keeps KYC's action queue behind the shared filter bar", () => {
    const source = read("app/admin/kyc/page.tsx");
    expect(source).toContain("AdminFilterBar");
    expect(source).toContain("kyc.filters.search");
    expect(source).toContain("kyc.filters.status");
    expect(source).toContain("kyc.queue.oldestFirst");
    expect(source).toContain("kyc.accessibility.reason");
  });

  it("preserves segmented review filters and the user search/filter handlers", () => {
    expect(read("app/admin/catalogue/page.tsx")).toContain("<AdminSegmentedFilter");
    const users = read("app/admin/users/page.tsx");
    expect(users).toContain("submitSearch");
    expect(users).toContain("changeFilter");
    expect(users).toContain("resetFilters");
  });

  it("keeps long-form search controls flexible instead of fixed-width", () => {
    const affiliate = read("app/admin/affiliate/page.tsx");
    const payouts = read("app/admin/reports/payouts/page.tsx");
    expect(affiliate).toContain("min-w-[220px] flex-1");
    expect(affiliate).not.toContain("adminFilterControlClassName} w-56");
    expect(payouts).toContain("min-w-[220px] flex-1");
  });

  it("keeps Task 2 search wrappers flexible and native filter controls non-shrinking", () => {
    for (const file of [
      "app/admin/vendors/page.tsx",
      "app/admin/users/page.tsx",
      "app/admin/kyc/page.tsx",
      "app/admin/withdrawals/page.tsx",
      "app/admin/recommendations/page.tsx",
      "components/admin/staff-conduct-panel.tsx",
    ]) {
      expect(read(file), `${file} must use a flexible search wrapper`).toContain("min-w-[220px] flex-1");
    }

    expect(read("components/admin/filter-bar.tsx")).toContain("shrink-0");
  });
});
