import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ADMIN_ROUTE_PAGES = [
  "app/admin/affiliate/page.tsx",
  "app/admin/ai-assistant/page.tsx",
  "app/admin/catalogue/page.tsx",
  "app/admin/chat-reports/page.tsx",
  "app/admin/chatbot/page.tsx",
  "app/admin/dashboard/page.tsx",
  "app/admin/kyc/page.tsx",
  "app/admin/recommendations/[id]/page.tsx",
  "app/admin/recommendations/page.tsx",
  "app/admin/refunds/page.tsx",
  "app/admin/reports/payouts/page.tsx",
  "app/admin/rewards/page.tsx",
  "app/admin/staff-conduct/page.tsx",
  "app/admin/support/page.tsx",
  "app/admin/users/page.tsx",
  "app/admin/vendors/page.tsx",
  "app/admin/wallet/settings/page.tsx",
  "app/admin/withdrawals/page.tsx",
] as const;

// Each rollout task appends only the routes it migrates; Task 6 requires all 18.
const MIGRATED_ADMIN_ROUTE_PAGES: readonly (typeof ADMIN_ROUTE_PAGES)[number][] = [
  "app/admin/affiliate/page.tsx",
  "app/admin/catalogue/page.tsx",
  "app/admin/chat-reports/page.tsx",
  "app/admin/kyc/page.tsx",
  "app/admin/recommendations/page.tsx",
  "app/admin/refunds/page.tsx",
  "app/admin/staff-conduct/page.tsx",
  "app/admin/support/page.tsx",
  "app/admin/users/page.tsx",
  "app/admin/vendors/page.tsx",
  "app/admin/withdrawals/page.tsx",
];

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("admin page-shell consistency contract", () => {
  it("keeps the complete Admin route inventory", () => {
    expect(ADMIN_ROUTE_PAGES).toHaveLength(18);
    expect(new Set(ADMIN_ROUTE_PAGES)).toHaveLength(18);

    for (const route of ADMIN_ROUTE_PAGES) {
      expect(existsSync(resolve(process.cwd(), route)), `${route} must remain in the Admin route inventory`).toBe(true);
    }
  });

  it("requires each migrated route to import and render the shared shell", () => {
    for (const route of MIGRATED_ADMIN_ROUTE_PAGES) {
      const source = read(route);
      expect(source, `${route} must import AdminPageShell`).toMatch(/import[\s\S]*AdminPageShell[\s\S]*from[\s\S]*admin-page-shell/);
      expect(source, `${route} must render AdminPageShell`).toContain("<AdminPageShell");
    }
  });
});
