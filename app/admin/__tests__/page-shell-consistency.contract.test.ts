import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ADMIN_ROUTE_PAGES = [
  "app/admin/access-control/page.tsx",
  "app/admin/affiliate/page.tsx",
  "app/admin/ai-assistant/page.tsx",
  "app/admin/announcements/page.tsx",
  "app/admin/catalogue/hotel-amenities/page.tsx",
  "app/admin/catalogue/page.tsx",
  "app/admin/chat-reports/page.tsx",
  "app/admin/chatbot/page.tsx",
  "app/admin/dashboard/page.tsx",
  "app/admin/event-promotions/[id]/page.tsx",
  "app/admin/event-promotions/page.tsx",
  "app/admin/event-registrations/[id]/page.tsx",
  "app/admin/event-registrations/page.tsx",
  "app/admin/help/[slug]/page.tsx",
  "app/admin/help/page.tsx",
  "app/admin/hotel-amenities/page.tsx",
  "app/admin/kyc/[submissionId]/page.tsx",
  "app/admin/kyc/mfa/page.tsx",
  "app/admin/kyc/page.tsx",
  "app/admin/moderation-words/page.tsx",
  "app/admin/notifications/page.tsx",
  "app/admin/orders/page.tsx",
  "app/admin/promotion-campaigns/page.tsx",
  "app/admin/recommendations/[id]/page.tsx",
  "app/admin/recommendations/page.tsx",
  "app/admin/recommendations/rewards/page.tsx",
  "app/admin/refunds/page.tsx",
  "app/admin/reports/payouts/page.tsx",
  "app/admin/reports/reconciliation/page.tsx",
  "app/admin/rewards/page.tsx",
  "app/admin/security/page.tsx",
  "app/admin/sponsored-placements/page.tsx",
  "app/admin/staff-conduct/page.tsx",
  "app/admin/support/page.tsx",
  "app/admin/system-settings/page.tsx",
  "app/admin/users/page.tsx",
  "app/admin/vendors/page.tsx",
  "app/admin/vendors/platform-fees/page.tsx",
  "app/admin/wallet/approvers/page.tsx",
  "app/admin/wallet/settings/page.tsx",
  "app/admin/withdrawals/[id]/page.tsx",
  "app/admin/withdrawals/page.tsx",
] as const;

const ADMIN_SHELL_EXCEPTIONS = [
  "app/admin/catalogue/hotel-amenities/page.tsx",
  "app/admin/kyc/mfa/page.tsx",
  "app/admin/security/page.tsx",
] as const;

const ADMIN_SHELL_EXCEPTION_SET = new Set<string>(ADMIN_SHELL_EXCEPTIONS);
const DIRECT_ADMIN_SHELL_ROUTE_PAGES = ADMIN_ROUTE_PAGES.filter(
  (route) => !ADMIN_SHELL_EXCEPTION_SET.has(route),
);

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

function discoverAdminRoutePages(directory = "app/admin"): string[] {
  return readdirSync(resolve(process.cwd(), directory), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return discoverAdminRoutePages(path);
    return entry.name === "page.tsx" ? [path] : [];
  }).sort();
}

describe("admin page-shell consistency contract", () => {
  it("keeps the complete Admin route inventory", () => {
    expect(ADMIN_ROUTE_PAGES).toHaveLength(42);
    expect(new Set(ADMIN_ROUTE_PAGES)).toHaveLength(42);
    expect(discoverAdminRoutePages()).toEqual([...ADMIN_ROUTE_PAGES].sort());

    for (const route of ADMIN_ROUTE_PAGES) {
      expect(existsSync(resolve(process.cwd(), route)), `${route} must remain in the Admin route inventory`).toBe(true);
    }
  });

  it("requires each direct Admin route to import and render the shared shell", () => {
    expect(DIRECT_ADMIN_SHELL_ROUTE_PAGES).toHaveLength(39);
    for (const route of DIRECT_ADMIN_SHELL_ROUTE_PAGES) {
      const source = read(route);
      expect(source, `${route} must import AdminPageShell`).toMatch(/import[\s\S]*AdminPageShell[\s\S]*from[\s\S]*admin-page-shell/);
      expect(source, `${route} must render AdminPageShell`).toContain("<AdminPageShell");
    }
  });

  it("documents the catalogue alias, KYC MFA shell delegation, and security redirect", () => {
    expect([...ADMIN_SHELL_EXCEPTIONS].sort()).toEqual([
      "app/admin/catalogue/hotel-amenities/page.tsx",
      "app/admin/kyc/mfa/page.tsx",
      "app/admin/security/page.tsx",
    ]);

    const catalogueAlias = read("app/admin/catalogue/hotel-amenities/page.tsx");
    expect(catalogueAlias).toContain("export { default } from '@/app/admin/hotel-amenities/page';");

    const kycMfaRoute = read("app/admin/kyc/mfa/page.tsx");
    expect(kycMfaRoute).toContain("<KycMfa");
    expect(kycMfaRoute).toContain("safeKycReviewNext(params.next)");
    const kycMfaComponent = read("components/admin/kyc-mfa.tsx");
    expect(kycMfaComponent).toContain("if (staff) return <AuthPageShell");
    expect(kycMfaComponent).toContain("return <AdminPageShell");

    const securityRedirect = read("app/admin/security/page.tsx");
    expect(securityRedirect).toContain("redirect(staffMfaDestination(params.next ?? \"/admin/dashboard\"))");
  });

  it("keeps both standalone staff security destinations responsive and routed safely", () => {
    const staffMfa = read("app/auth/staff-mfa/page.tsx");
    expect(staffMfa).toContain("<KycMfa next={safeStaffVerificationNext(params.next)} scope=\"staff\"");
    expect(read("components/admin/kyc-mfa.tsx")).toContain("if (staff) return <AuthPageShell");

    const staffVerification = read("app/auth/staff-verification/page.tsx");
    expect(staffVerification).toContain("<StaffPasskey embedded");
    expect(staffVerification).toContain("safeStaffVerificationNext(params.get('next'))");
    expect(staffVerification).toContain("<AuthPageShell");
  });

  it("keeps the recommendation detail title on the shared header", () => {
    const source = read("components/admin/recommendation-detail-view.tsx");
    expect(source).toMatch(/import[\s\S]*AdminPageHeader[\s\S]*from[\s\S]*admin-page-shell/);
    expect(source).toContain("<AdminPageHeader");
  });
});
