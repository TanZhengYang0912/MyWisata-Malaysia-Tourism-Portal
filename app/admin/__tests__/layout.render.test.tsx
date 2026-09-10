import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@/backend/core/types";

const mocks = vi.hoisted(() => ({
  role: "approver" as Role,
  pathname: "/admin/withdrawals",
  replace: vi.fn(),
  staffPermissionKeys: [] as string[],
}));

vi.mock("@/components/providers/auth", () => ({
  useRequireRole: () => ({ currentUser: { id: "staff-test", name: "Test staff", role: mocks.role }, staffPermissionKeys: mocks.staffPermissionKeys, loading: false }),
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

describe("admin navigation role rendering", () => {
  beforeEach(() => {
    mocks.role = "approver";
    mocks.pathname = "/admin/withdrawals";
    mocks.staffPermissionKeys = [];
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

  it("preserves all 20 Super Admin navigation entries", () => {
    mocks.role = "super_admin";
    mocks.pathname = "/admin/dashboard";
    expect(navigationHrefs(renderLayout())).toEqual([
      "/admin/dashboard", "/admin/vendors", "/admin/catalogue", "/admin/sponsored-placements", "/admin/users", "/admin/access-control",
      "/admin/kyc", "/admin/withdrawals", "/admin/refunds", "/admin/wallet/settings", "/admin/wallet/approvers",
      "/admin/reports/payouts", "/admin/reports/reconciliation", "/admin/recommendations", "/admin/support", "/admin/chat-reports",
      "/admin/affiliate", "/admin/chatbot", "/admin/ai-assistant", "/admin/staff-conduct",
    ]);
  });

  it("preserves content admin navigation", () => {
    mocks.role = "admin";
    mocks.pathname = "/admin/dashboard";
    expect(navigationHrefs(renderLayout())).toEqual([
      "/admin/dashboard", "/admin/vendors", "/admin/catalogue", "/admin/sponsored-placements", "/admin/kyc", "/admin/refunds",
      "/admin/recommendations", "/admin/support", "/admin/chat-reports", "/admin/affiliate", "/admin/chatbot",
    ]);
  });

  it("shows Staff only the work areas granted by effective permissions", () => {
    mocks.role = "staff";
    mocks.pathname = "/admin/kyc";
    mocks.staffPermissionKeys = ["admin.kyc.review", "admin.vendor.manage"];
    const markup = renderLayout();
    expect(navigationHrefs(markup)).toEqual(["/admin/vendors", "/admin/kyc"]);
    expect(markup).not.toContain("command.searchAdminPlaceholder");
  });
});
