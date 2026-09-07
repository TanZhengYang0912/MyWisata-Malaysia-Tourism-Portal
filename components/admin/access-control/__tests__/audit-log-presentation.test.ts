import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  AUDIT_ACTION_SUMMARY_KEYS,
  auditActionSummaryKey,
  deriveAuditChanges,
  hasTechnicalAuditPayload,
} from "@/components/admin/access-control/audit-log-presentation";

const EXPECTED_ACTIONS = [
  "affiliate.link.disabled",
  "affiliate.link.reenabled",
  "content.approve",
  "content.reject",
  "content.request_changes",
  "entitlement.assignment.revoked",
  "entitlement.assignment.set",
  "entitlement.capability.updated",
  "entitlement.policy.rollback_requested",
  "entitlement.policy_version.activated",
  "entitlement.policy_version.approved",
  "entitlement.policy_version.created",
  "entitlement.shadow_evaluation",
  "kyc.approve",
  "kyc.document_viewed",
  "kyc.reject",
  "kyc.request_info",
  "recommendation.approve",
  "recommendation.converted",
  "recommendation.reject",
  "recommendation.request_changes",
  "staff.invitation.accepted",
  "staff.invitation.claimed",
  "staff.invitation.created",
  "staff.invitation.delivery_failed",
  "staff.invitation.delivery_succeeded",
  "staff.invitation.resent",
  "staff.invitation.revoked",
  "staff.role.assigned",
  "staff.role.created",
  "staff.role.revoked",
  "staff.role.updated",
  "tier.admin_set",
  "vendor.approval_email_sent",
  "vendor.approved",
  "vendor.information_requested",
  "vendor.profile_updated",
  "vendor.rejected",
  "vendor.suspended",
  "vendor.unsuspended",
  "wallet.approver_granted",
  "wallet.approver_revoked",
  "wallet.settings_updated",
  "withdrawal.approval_recorded",
  "withdrawal.approve",
  "withdrawal.callback_queued",
  "withdrawal.execution_failed",
  "withdrawal.hold",
  "withdrawal.payout_retry_requested",
  "withdrawal.processing_started",
  "withdrawal.reject",
  "withdrawal.resume",
  "withdrawal.reviewed",
  "withdrawal.stripe_payout_recorded",
  "withdrawal.submitted",
] as const;

function auditTranslations(locale: "en" | "ms" | "zh-CN") {
  const source = JSON.parse(readFileSync(
    resolve(process.cwd(), `app/i18n/locales/${locale}/admin.json`),
    "utf8",
  )) as {
    accessControl?: { audit?: { actionSummaries?: Record<string, unknown> } };
  };
  return source.accessControl?.audit?.actionSummaries ?? {};
}

describe("human-readable audit presentation", () => {
  it("catalogues every approved action exactly and uses an explicit unknown fallback", () => {
    expect(Object.keys(AUDIT_ACTION_SUMMARY_KEYS).sort()).toEqual([...EXPECTED_ACTIONS].sort());
    expect(auditActionSummaryKey("kyc.approve")).toBe("kycApprove");
    expect(auditActionSummaryKey("future.unmapped_action")).toBe("unknown");
  });

  it("derives only changed primitive sanitized fields", () => {
    expect(deriveAuditChanges(
      { status: "pending", nested: { secret: "before" } },
      { status: "approved", submissionId: "submission-1", nested: { secret: "after" } },
    )).toEqual([
      { field: "status", before: "pending", after: "approved" },
      { field: "submissionId", before: undefined, after: "submission-1" },
    ]);
  });

  it("detects whether sanitized technical evidence exists", () => {
    expect(hasTechnicalAuditPayload(null, null)).toBe(false);
    expect(hasTechnicalAuditPayload(null, {})).toBe(true);
    expect(hasTechnicalAuditPayload({ status: "pending" }, null)).toBe(true);
  });

  it("provides every exact action summary in all supported locales", () => {
    const suffixes = ["unknown", ...new Set(Object.values(AUDIT_ACTION_SUMMARY_KEYS))];
    const locales = ["en", "ms", "zh-CN"] as const;
    for (const locale of locales) {
      const translations = auditTranslations(locale);
      for (const suffix of suffixes) {
        expect(translations[suffix], `${locale} is missing ${suffix}`).toEqual(expect.any(String));
        expect(String(translations[suffix]).trim(), `${locale} has an empty ${suffix}`).not.toBe("");
      }
    }

    expect(new Set(locales.map((locale) => auditTranslations(locale).kycApprove)).size).toBe(3);
  });
});
