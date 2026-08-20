import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

function flattenStrings(value: unknown, prefix = "", result: Record<string, string> = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object" && !Array.isArray(child)) flattenStrings(child, path, result);
    else if (typeof child === "string") result[path] = child;
  }
  return result;
}

const INTENTIONAL_IDENTICAL_VALUES = {
  "zh-CN": new Set([
    "kyc.documents.national_id",
    "ui.table.kyc",
    "ui.vendors.kyc",
    "email.draft.recipientPlaceholder",
    "userManagement.fields.kyc",
    "strictMigration.moderationFlagSummary",
    "strictMigration.recommendationPhotoStatus",
  ]),
  ms: new Set([
    "navigation.Chatbot",
    "affiliate.columns.status",
    "catalogue.entity.outlet",
    "catalogue.fields.vendor",
    "chatbot.categories.vendor",
    "chatReports.fallback.outlet",
    "chatReports.fields.status",
    "chatReports.reasons.spam",
    "chatReports.roles.vendor",
    "kyc.documents.national_id",
    "ui.support.sort.status",
    "ui.support.statusLabel",
    "ui.table.bio",
    "ui.table.kyc",
    "ui.table.status",
    "ui.table.vendor",
    "ui.vendors.kyc",
    "email.draft.recipientPlaceholder",
    "recommendation.aiReview.findingKinds.spam",
    "userManagement.fields.kyc",
    "withdrawals.accessibility.openRow",
    "withdrawals.detail.status",
    "withdrawals.enumValues.debit",
    "withdrawals.table.status",
    "refunds.providers.stripeSandbox",
    "strictMigration.moderationFlagSummary",
    "strictMigration.recommendationEvidence",
    "strictMigration.recommendationFindingMeta",
    "strictMigration.recommendationPhotoStatus",
  ]),
} as const;

export const ADMIN_ROUTE_I18N_FILES = [
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
  "app/admin/support/page.tsx",
  "app/admin/users/page.tsx",
  "app/admin/vendors/page.tsx",
  "app/admin/wallet/settings/page.tsx",
  "app/admin/withdrawals/page.tsx",
] as const;

/** The exclusive Task 9 component scope for this worker. */
export const ADMIN_I18N_FILES = [
  "components/admin/ai-draft-email-modal.tsx",
  "components/admin/approve-reject-bar.tsx",
  "components/admin/moderation-flags-panel.tsx",
  "components/admin/recommendation-ai-review-panel.tsx",
  "components/admin/recommendation-detail-view.tsx",
  "components/admin/staff-conduct-panel.tsx",
  "components/admin/user-management-drawer.tsx",
  "components/shared/affiliate-qr-code.tsx",
  "components/shared/share-button.tsx",
] as const;

/** These admin helpers were localized by prior tasks and remain out of scope. */
export const PRIOR_TASK_FILES = [
  "components/admin/batch-action-bar.tsx",
  "components/admin/confirm-dialog.tsx",
  "components/admin/segmented-filter.tsx",
] as const;

/** Non-rendering code is inventory-visible but does not need a translation hook. */
export const NON_RENDERING_HELPERS = [
  "FIELD_LABELS",
  "FINDING_KIND_LABELS",
  "SEVERITY_LABELS",
  "PHOTO_STATUS_LABELS",
  "FIELD_TARGETS",
  "fileNameFor",
  "DIRECT_PATH",
  "SHARE_IMAGE_TYPES",
  "statusClass",
] as const;

const expectedComponentInventory = [...ADMIN_I18N_FILES, ...PRIOR_TASK_FILES].sort();

const SURFACE_ASSERTIONS = {
  filters: ["components/admin/segmented-filter.tsx", "filters."],
  counts: ["components/admin/recommendation-ai-review-panel.tsx", "issueCount"],
  pagination: ["app/admin/recommendations/page.tsx", "pendingPageCount"],
  batch: ["components/admin/batch-action-bar.tsx", "batchActions."],
  actions: ["components/admin/approve-reject-bar.tsx", "actions.approve"],
  status: ["components/admin/user-management-drawer.tsx", "status"],
  moderation: ["components/admin/moderation-flags-panel.tsx", "moderation."],
  dialog: ["components/admin/ai-draft-email-modal.tsx", "alertdialog"],
  table: ["app/admin/users/page.tsx", "<table"],
  empty: ["components/admin/user-management-drawer.tsx", "auditHistory.length === 0"],
} as const;

function componentInventory(): string[] {
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(resolve(process.cwd(), directory), { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name !== "__tests__") visit(path);
      } else if (/\.(?:ts|tsx)$/.test(entry.name)) {
        files.push(path);
      }
    }
  };
  visit("components/admin");
  files.push("components/shared/affiliate-qr-code.tsx", "components/shared/share-button.tsx");
  return files.sort();
}

function hasAdminTranslationBinding(source: string): boolean {
  return /useTranslation\(["']admin["']\)|getServerTranslation\(["']admin["']\)/.test(source);
}

function callsBoundTranslator(source: string): boolean {
  const bindings = [...source.matchAll(/\{\s*t(?:\s*:\s*([A-Za-z_$][\w$]*))?[^}]*\}\s*=\s*useTranslation\(/g)]
    .map((match) => match[1] ?? "t");
  return bindings.some((binding) => new RegExp(`\\b${binding}\\s*\\(`).test(source));
}

describe("admin component sitewide i18n contract", () => {
  it("keeps the exact Task 9 route inventory available to the whole-site audit", () => {
    for (const file of ADMIN_ROUTE_I18N_FILES) {
      const source = read(file);
      if (file === "app/admin/recommendations/[id]/page.tsx") {
        expect(source).toContain("<RecommendationDetailView");
      } else {
        expect(hasAdminTranslationBinding(source), `${file} must bind admin translations`).toBe(true);
        expect(callsBoundTranslator(source), `${file} must call its bound translator`).toBe(true);
      }
    }
  });

  it("keeps the exact exclusive inventory and explicit prior-task boundary", () => {
    expect(componentInventory()).toEqual(expectedComponentInventory);
    for (const file of [...ADMIN_I18N_FILES, ...PRIOR_TASK_FILES]) {
      expect(() => read(file), file).not.toThrow();
    }
    expect(PRIOR_TASK_FILES).toContain("components/admin/segmented-filter.tsx");
    expect(PRIOR_TASK_FILES).toContain("components/admin/batch-action-bar.tsx");
    expect(PRIOR_TASK_FILES).toContain("components/admin/confirm-dialog.tsx");
    expect(NON_RENDERING_HELPERS).toEqual(expect.arrayContaining(["FIELD_LABELS", "fileNameFor", "DIRECT_PATH"]));
  });

  it.each(ADMIN_I18N_FILES)("uses the admin translation runtime in %s", (file) => {
    const source = read(file);
    expect(hasAdminTranslationBinding(source), `${file} must bind admin translations`).toBe(true);
    expect(callsBoundTranslator(source), `${file} must call its bound translator`).toBe(true);
  });

  it("keeps targeted admin surface coverage visible in the contract", () => {
    for (const [surface, [file, marker]] of Object.entries(SURFACE_ASSERTIONS)) {
      expect(read(file), `${surface} surface marker`).toContain(marker);
    }
  });

  it("uses dedicated semantic key families for the exclusive renderers", () => {
    const expectations: Record<string, string[]> = {
      "components/admin/ai-draft-email-modal.tsx": ["email.draft."],
      "components/admin/approve-reject-bar.tsx": ["actions.approve", "actions.reject"],
      "components/admin/moderation-flags-panel.tsx": ["moderation.flags."],
      "components/admin/recommendation-ai-review-panel.tsx": ["recommendation.aiReview."],
      "components/admin/recommendation-detail-view.tsx": ["recommendation.detail."],
      "components/admin/user-management-drawer.tsx": ["userManagement."],
      "components/shared/affiliate-qr-code.tsx": ["affiliate.qr."],
      "components/shared/share-button.tsx": ["share.actions."],
    };

    for (const [file, markers] of Object.entries(expectations)) {
      const source = read(file);
      for (const marker of markers) {
        expect(source, `${file} must use ${marker}`).toContain(marker);
      }
    }
  });

  it("keeps translated admin values distinct except for intentional terms and brands", () => {
    const english = flattenStrings(JSON.parse(read("app/i18n/locales/en/admin.json")));
    for (const locale of ["zh-CN", "ms"] as const) {
      const localized = flattenStrings(JSON.parse(read(`app/i18n/locales/${locale}/admin.json`)));
      expect(Object.keys(localized).sort(), `${locale} admin key parity`).toEqual(Object.keys(english).sort());
      const identical = Object.keys(english).filter((key) => localized[key] === english[key]);
      expect(identical.sort(), `${locale} may only retain intentional identical values`).toEqual(
        [...INTENTIONAL_IDENTICAL_VALUES[locale]].sort(),
      );
    }
  });

  it("uses valid chatbot reindex result keys and locale-aware admin formatting", () => {
    const chatbot = read("app/admin/chatbot/page.tsx");
    expect(chatbot).toContain('t("chatbot.reindexResult"');
    expect(chatbot).toContain('t("chatbot.reindexErrors"');
    expect(chatbot).not.toContain("chatbot.reindex.result");

    for (const file of [
      "app/admin/catalogue/page.tsx",
      "app/admin/dashboard/page.tsx",
      "app/admin/kyc/page.tsx",
      "app/admin/users/page.tsx",
      "app/admin/wallet/settings/page.tsx",
      "app/admin/withdrawals/page.tsx",
    ]) {
      expect(read(file), `${file} must not force English-Malaysia formatting`).not.toContain('"en-MY"');
    }
  });

  it("keeps high-risk admin prompts, statuses, and accessibility copy semantic", () => {
    const catalogue = read("app/admin/catalogue/page.tsx");
    expect(catalogue).toContain('ariaLabel="catalogue.accessibility.itemType"');
    expect(catalogue).not.toContain('ariaLabel="Catalogue item type"');
    expect(catalogue).not.toContain("action === 'reject' ? 'Reject' : 'Request changes'");

    const chatReports = read("app/admin/chat-reports/page.tsx");
    expect(chatReports).toContain('chatReports.accessibility.selectReport');
    expect(chatReports).toContain('chatReports.status');
    expect(chatReports).not.toContain("Select chat report ${r.id}");
    expect(chatReports).not.toContain('RESOLUTION_REASONS.map((reason) => reason.value).join(", ")');

    const kyc = read("app/admin/kyc/page.tsx");
    expect(kyc).toContain('kyc.ocr.status.${submission.ocr.status}');
    expect(kyc).toContain('kyc.reasons.${code}');
    expect(kyc).not.toContain('KYC_REVIEW_REASON_CODES.join(", ")');

    const affiliate = read("app/admin/affiliate/page.tsx");
    expect(affiliate).toContain('affiliate.flagTypes.${key}');
    expect(affiliate).toContain('affiliate.analytics.openPercentage');
    expect(affiliate).toContain('affiliate.status.${f.status}');
    expect(affiliate).toContain('affiliate.status.${r.status}');

    const vendors = read("app/admin/vendors/page.tsx");
    expect(vendors).toContain("ui.users.status.${owner.kyc_status ?? 'unverified'}");
    expect(vendors).toContain("ui.vendors.status.suspended");

    const refunds = read("app/admin/refunds/page.tsx");
    expect(refunds).toContain('refunds.status.processed');

    const withdrawals = read("app/admin/withdrawals/page.tsx");
    expect(withdrawals).toContain('decisionReason(reasonAction, category)');
    expect(withdrawals).not.toContain('allowedReasons.join(", ")');
  });
});
