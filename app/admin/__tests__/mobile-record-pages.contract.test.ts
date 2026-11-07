import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

const ADMIN_TABLE_ROUTE_PAGES = [
  "app/admin/affiliate/page.tsx",
  "app/admin/hotel-amenities/page.tsx",
  "app/admin/moderation-words/page.tsx",
  "app/admin/orders/page.tsx",
  "app/admin/reports/payouts/page.tsx",
  "app/admin/reports/reconciliation/page.tsx",
  "app/admin/rewards/page.tsx",
  "app/admin/users/page.tsx",
  "app/admin/vendors/page.tsx",
] as const;

describe("Admin mobile record pages", () => {
  it("keeps every wide Admin table on a desktop-only surface with a mobile alternative", () => {
    expect(ADMIN_TABLE_ROUTE_PAGES).toHaveLength(9);
    for (const file of ADMIN_TABLE_ROUTE_PAGES) {
      const source = read(file);
      expect(source, `${file} still owns a wide table`).toContain("<table");
      expect(source, `${file} must keep mobile cards visible below 1024px`).toContain("lg:hidden");
      expect(source, `${file} must retain the desktop table at 1024px and above`).toMatch(/hidden[\s\S]*lg:(?:block|table)/);
    }
  });

  it("pairs phone cards with the existing desktop data surface", () => {
    for (const file of [
      "app/admin/catalogue/page.tsx",
      "app/admin/vendors/page.tsx",
      "app/admin/users/page.tsx",
    ]) {
      const source = read(file);
      expect(source, `${file} must render the shared card`).toContain("AdminMobileRecordCard");
      expect(source, `${file} must retain its desktop layout`).toContain("lg:block");
      expect(source, `${file} must switch surfaces below desktop`).toContain("lg:hidden");
    }

    const withdrawals = read("app/admin/withdrawals/page.tsx");
    expect(withdrawals).toContain("compact");
    expect(withdrawals).toContain("lg:block");
    expect(withdrawals).toContain("lg:hidden");
    expect(read("components/admin/withdrawal-review-queue-row.tsx")).toContain("AdminMobileRecordCard");
  });

  it("keeps catalogue decisions, selection, and identity visible on mobile", () => {
    const source = read("app/admin/catalogue/page.tsx");
    expect(source).toContain("catalogue.accessibility.selectItem");
    expect(source).toContain("catalogue.columns.vendorLocation");
    expect(source).toContain("catalogue.columns.submitted");
    expect(source).toContain("setActive(item)");
    expect(source).toContain("review(item, 'approve')");
    expect(source).toContain("AdminBatchActionBar");
  });

  it("keeps vendor identity, owner, status, copy, and review actions available", () => {
    const source = read("app/admin/vendors/page.tsx");
    expect(source).toContain("ui.vendors.selectVendor");
    expect(source).toContain("owner.full_name");
    expect(source).toContain("owner.kyc_status");
    expect(source).toContain("copyVendorId(vendor.id)");
    expect(source).toContain("setActiveVendor(vendor)");
    expect(source).toContain("countOf(vendor.outlets)");
    expect(source).toContain("countOf(vendor.products)");
  });

  it("keeps user selection, verification, KYC, bio, and detail actions available", () => {
    const source = read("app/admin/users/page.tsx");
    expect(source).toContain("ui.users.selectUser");
    expect(source).toContain("user.emailVerified");
    expect(source).toContain("user.phoneVerified");
    expect(source).toContain("user.kycStatus");
    expect(source).toContain("user.bioCooldownUntil");
    expect(source).toContain("setSelectedUserId(user.id)");
    expect(source).toContain("UserManagementDrawer");
  });

  it("keeps withdrawal money, risk, approval progress, SLA, status, and detail link paired", () => {
    const source = read("components/admin/withdrawal-review-queue-row.tsx");
    expect(source).toContain("AdminMobileRecordCard");
    expect(source).toContain("href={`/admin/withdrawals/${item.id}`}");
    expect(source).toContain("item.amountSen");
    expect(source).toContain("priority.labelKey");
    expect(source).toContain("item.approvalCount");
    expect(source).toContain("formatAge(item.createdAt)");
    expect(source).toContain("displayStatus(item.riskLevel)");
  });

  it("renders operations and finance records as labeled mobile cards while retaining desktop tables", () => {
    const routes = [
      ["app/admin/orders/page.tsx", ["orderOperations.payment", "orderOperations.total", "orderOperations.created"]],
      ["app/admin/refunds/page.tsx", ["refunds.table.amount", "refunds.table.provider", "refunds.table.status"]],
      ["app/admin/affiliate/page.tsx", ["affiliate.columns.severity", "affiliate.columns.evidence", "affiliate.columns.commission"]],
      ["app/admin/reports/payouts/page.tsx", ["payouts.columns.source", "payouts.columns.amount", "payouts.columns.fees"]],
      ["app/admin/reports/reconciliation/page.tsx", ["reconciliation.columns.gross", "reconciliation.columns.vendorNet", "reconciliation.columns.platformNet"]],
      ["app/admin/rewards/page.tsx", ["rewards.columns.rollingConfirmed", "rewards.columns.rate"]],
    ] as const;

    for (const [file, labels] of routes) {
      const source = read(file);
      expect(source, `${file} must render the shared mobile card`).toContain("AdminMobileRecordCard");
      expect(source, `${file} must retain desktop content`).toMatch(/lg:(?:block|table)/);
      expect(source, `${file} must provide a mobile surface`).toContain("lg:hidden");
      for (const label of labels) expect(source, `${file} must label ${label}`).toContain(label);
    }

    const affiliate = read("app/admin/affiliate/page.tsx");
    expect(affiliate).toContain("selectedFlagIds.has(f.id)");
    expect(affiliate).toContain("reviewGuestCommission(r.id");
    expect(affiliate).toContain("reviewAttribution(r.id");
  });

  it("keeps catalogue settings and Access Control records readable and actionable on mobile", () => {
    const surfaces = [
      ["app/admin/hotel-amenities/page.tsx", ["hotelAmenities.table.code", "hotelAmenities.table.labels", "toggleActive(amenity)"]],
      ["app/admin/moderation-words/page.tsx", ["moderationWords.table.term", "moderationWords.table.language", "removeWord(word)"]],
      ["components/admin/access-control/capabilities-tab.tsx", ["accessControl.capabilities.risk", "accessControl.capabilities.assignment", "setEditorOpen(true)"]],
      ["components/admin/access-control/assignments-tab.tsx", ["accessControl.assignments.period", "accessControl.assignments.reason", "setPending({ type: \"revoke\""]],
      ["components/admin/access-control/audit-log-tab.tsx", ["accessControl.audit.policyVersion", "accessControl.audit.trace", "setExpanded((value)"]],
      ["components/admin/access-control/policies-tab.tsx", ["accessControl.policies.versions", "accessControl.actions.open", "openPolicy(policy)"]],
    ] as const;

    for (const [file, markers] of surfaces) {
      const source = read(file);
      expect(source, `${file} must render mobile records`).toContain("AdminMobileRecordCard");
      expect(source, `${file} must preserve its desktop table`).toContain("lg:");
      for (const marker of markers) expect(source, `${file} must preserve ${marker}`).toContain(marker);
    }

    expect(read("components/admin/access-control/audit-log-tab.tsx")).toContain("max-h-56 overflow-auto");
    expect(read("components/admin/access-control/staff-roles-tab.tsx")).toContain("flex-wrap justify-end gap-2");
  });

  it("keeps chatbot question text readable before its AI actions on phones", () => {
    const source = read("app/admin/chatbot/page.tsx");
    expect(source).toContain("flex min-w-0 flex-col gap-3 border-t border-border pt-3 text-sm first:border-t-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between");
    expect(source).toContain('className="break-words"');
    expect(source).toContain("min-w-[8rem] flex-1 justify-center");
  });

  it("places Staff Conduct actions below the full record summary on phones", () => {
    const source = read("components/admin/staff-conduct-panel.tsx");
    expect(source).toContain("flex flex-col items-stretch gap-3 px-4 py-4 text-sm lg:flex-row lg:items-start lg:justify-between");
    expect(source).toContain("w-full flex-wrap items-center gap-2 lg:w-auto lg:shrink-0");
    expect(source).toContain("min-h-11");
  });

  it("gives moderation form controls the full mobile card width", () => {
    const source = read("app/admin/moderation-words/page.tsx");
    expect(source.match(/className=\{`\$\{adminFilterControlClassName\} w-full`\}/g)).toHaveLength(3);
    expect(source).toContain("min-h-11 w-full sm:w-auto");
  });

  it("keeps user identity wide and groups account status with other profile facts", () => {
    const source = read("app/admin/users/page.tsx");
    expect(source).toContain('t("ui.table.status")');
    expect(source).toContain('className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm"');
  });
});
