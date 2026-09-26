import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@/backend/core/types";

const mocks = vi.hoisted(() => ({
  role: "approver" as Role,
  pathname: "/admin/withdrawals",
  replace: vi.fn(),
  staffModules: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/components/providers/auth", () => ({
  useRequireRole: () => ({ currentUser: { id: "staff-test", name: "Test staff", role: mocks.role }, staffModules: mocks.staffModules, loading: false }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  usePathname: () => mocks.pathname,
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
// Toolbar controls have their own providers; this test exercises the real role-filtered layout.
vi.mock("@/components/shared/appearance-control", () => ({ AppearanceControl: () => null }));
vi.mock("@/components/shared/language-switcher", () => ({ LanguageSwitcher: () => null }));

import AdminLayout from "@/app/admin/layout";

function renderLayout() {
  return renderToStaticMarkup(<AdminLayout><p>Protected page content</p></AdminLayout>);
}

function navigationHrefs(markup: string) {
  return [...markup.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
}

function moduleFor(href: string, index: number) {
  const key = href.replace(/^\/admin\/?/, "").replaceAll("/", "_") || "overview";
  return {
    id: `module-${index}`, key, label: key, labelKey: null, description: null,
    sectionKey: "dynamic", sectionLabel: "Dynamic", sectionLabelKey: null, sectionSortOrder: 10,
    href, iconKey: "activity", sortOrder: index, groupKey: null, groupName: null, permissionKeys: [],
  };
}

const SUPER_ADMIN_HREFS = [
  "/admin/dashboard", "/admin/vendors", "/admin/catalogue", "/admin/sponsored-placements", "/admin/kyc", "/admin/recommendations",
  "/admin/withdrawals", "/admin/refunds", "/admin/wallet/settings", "/admin/wallet/approvers", "/admin/reports/payouts", "/admin/reports/reconciliation",
  "/admin/support", "/admin/chat-reports", "/admin/affiliate", "/admin/chatbot",
  "/admin/users", "/admin/access-control", "/admin/ai-assistant", "/admin/staff-conduct", "/admin/moderation-words",
];
const ADMIN_HREFS = [
  "/admin/dashboard", "/admin/vendors", "/admin/catalogue", "/admin/sponsored-placements", "/admin/kyc", "/admin/recommendations",
  "/admin/refunds", "/admin/support", "/admin/chat-reports", "/admin/affiliate", "/admin/chatbot",
];

describe("admin navigation role rendering", () => {
  beforeEach(() => {
    mocks.role = "approver";
    mocks.pathname = "/admin/withdrawals";
    mocks.staffModules = [moduleFor("/admin/withdrawals", 0)];
  });

  it("shows only Withdrawals to wallet approvers", () => {
    const markup = renderLayout();
    expect(navigationHrefs(markup)).toEqual(["/admin/withdrawals"]);
    expect(markup).toContain("Protected page content");
  });

  it.each(["/admin/dashboard", "/admin/vendors", "/admin/catalogue", "/admin/support", "/admin/refunds", "/admin/wallet/settings", "/admin/withdrawals-extra"])("does not mount unrelated approver page content at %s", (path) => {
    mocks.pathname = path;
    expect(renderLayout()).not.toContain("Protected page content");
  });

  it("keeps withdrawal detail pages accessible", () => {
    mocks.pathname = "/admin/withdrawals/request-id";
    expect(renderLayout()).toContain("Protected page content");
  });

  it("preserves all 21 Super Admin navigation entries", () => {
    mocks.role = "super_admin";
    mocks.pathname = "/admin/dashboard";
    mocks.staffModules = SUPER_ADMIN_HREFS.map(moduleFor);
    expect(navigationHrefs(renderLayout())).toEqual(SUPER_ADMIN_HREFS);
  });

  it("preserves content admin navigation", () => {
    mocks.role = "admin";
    mocks.pathname = "/admin/dashboard";
    mocks.staffModules = ADMIN_HREFS.map(moduleFor);
    expect(navigationHrefs(renderLayout())).toEqual(ADMIN_HREFS);
  });

  it("shows Staff only the work areas granted by effective permissions", () => {
    mocks.role = "staff";
    mocks.pathname = "/admin/kyc";
    mocks.staffModules = [moduleFor("/admin/vendors", 0), moduleFor("/admin/kyc", 1)];
    const markup = renderLayout();
    expect(navigationHrefs(markup)).toEqual(["/admin/vendors", "/admin/kyc"]);
    expect(markup).not.toContain("command.searchAdminPlaceholder");
  });

  it("shows Promotion Campaigns only when the dynamic module is granted", () => {
    mocks.role = "staff";
    mocks.pathname = "/admin/promotion-campaigns";
    mocks.staffModules = [moduleFor("/admin/promotion-campaigns", 0)];
    expect(navigationHrefs(renderLayout())).toEqual(["/admin/promotion-campaigns"]);

    mocks.staffModules = [moduleFor("/admin/vendors", 0)];
    expect(renderLayout()).not.toContain("Protected page content");
  });
});
