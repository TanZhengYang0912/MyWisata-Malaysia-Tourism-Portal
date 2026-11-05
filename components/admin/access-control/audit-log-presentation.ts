export const AUDIT_ACTION_SUMMARY_KEYS: Readonly<Record<string, string>> = {
  "affiliate.link.disabled": "affiliateLinkDisabled",
  "affiliate.link.reenabled": "affiliateLinkReenabled",
  "content.approve": "contentApprove",
  "content.reject": "contentReject",
  "content.request_changes": "contentRequestChanges",
  "entitlement.assignment.revoked": "entitlementAssignmentRevoked",
  "entitlement.assignment.set": "entitlementAssignmentSet",
  "entitlement.capability.updated": "entitlementCapabilityUpdated",
  "entitlement.policy.rollback_requested": "entitlementPolicyRollbackRequested",
  "entitlement.policy_version.activated": "entitlementPolicyVersionActivated",
  "entitlement.policy_version.approved": "entitlementPolicyVersionApproved",
  "entitlement.policy_version.created": "entitlementPolicyVersionCreated",
  "entitlement.shadow_evaluation": "entitlementShadowEvaluation",
  "kyc.approve": "kycApprove",
  "kyc.document_viewed": "kycDocumentViewed",
  "kyc.reject": "kycReject",
  "kyc.request_info": "kycRequestInfo",
  "recommendation.approve": "recommendationApprove",
  "recommendation.converted": "recommendationConverted",
  "recommendation.reject": "recommendationReject",
  "recommendation.request_changes": "recommendationRequestChanges",
  "staff.invitation.accepted": "staffInvitationAccepted",
  "staff.invitation.claimed": "staffInvitationClaimed",
  "staff.invitation.created": "staffInvitationCreated",
  "staff.invitation.delivery_failed": "staffInvitationDeliveryFailed",
  "staff.invitation.delivery_succeeded": "staffInvitationDeliverySucceeded",
  "staff.invitation.resent": "staffInvitationResent",
  "staff.invitation.revoked": "staffInvitationRevoked",
  "staff.module.created": "staffModuleCreated",
  "staff.module.updated": "staffModuleUpdated",
  "staff.passkey_approve": "staffPasskeyApprove",
  "staff.passkey_enrollment_grant": "staffPasskeyEnrollmentGrant",
  "staff.passkey_fraud-override": "staffPasskeyFraudOverride",
  "staff.passkey_login": "staffPasskeyLogin",
  "staff.passkey_manage": "staffPasskeyManage",
  "staff.passkey_recovery_grant": "staffPasskeyRecoveryGrant",
  "staff.passkey_register": "staffPasskeyRegister",
  "staff.passkey_retry-payout": "staffPasskeyRetryPayout",
  "staff.passkey_revoked": "staffPasskeyRevoked",
  "staff.role.assigned": "staffRoleAssigned",
  "staff.role.created": "staffRoleCreated",
  "staff.role.revoked": "staffRoleRevoked",
  "staff.role.updated": "staffRoleUpdated",
  "tier.admin_set": "tierAdminSet",
  "vendor.approval_email_sent": "vendorApprovalEmailSent",
  "vendor.approved": "vendorApproved",
  "vendor.information_requested": "vendorInformationRequested",
  "vendor.profile_updated": "vendorProfileUpdated",
  "vendor.rejected": "vendorRejected",
  "vendor.suspended": "vendorSuspended",
  "vendor.unsuspended": "vendorUnsuspended",
  "wallet.approver_granted": "walletApproverGranted",
  "wallet.approver_revoked": "walletApproverRevoked",
  "wallet.settings_updated": "walletSettingsUpdated",
  "withdrawal.approval_recorded": "withdrawalApprovalRecorded",
  "withdrawal.approve": "withdrawalApprove",
  "withdrawal.callback_queued": "withdrawalCallbackQueued",
  "withdrawal.execution_failed": "withdrawalExecutionFailed",
  "withdrawal.hold": "withdrawalHold",
  "withdrawal.payout_retry_requested": "withdrawalPayoutRetryRequested",
  "withdrawal.processing_started": "withdrawalProcessingStarted",
  "withdrawal.reject": "withdrawalReject",
  "withdrawal.resume": "withdrawalResume",
  "withdrawal.reviewed": "withdrawalReviewed",
  "withdrawal.stripe_payout_recorded": "withdrawalStripePayoutRecorded",
  "withdrawal.submitted": "withdrawalSubmitted",
};

export type AuditPrimitive = string | number | boolean | null;

export type AuditChange = {
  field: string;
  before: AuditChangeValue | undefined;
  after: AuditChangeValue | undefined;
};

export type AuditChangeValue = AuditPrimitive | string[];

function isAuditPrimitive(value: unknown): value is AuditPrimitive {
  return value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

export function auditActionSummaryKey(action: string) {
  return AUDIT_ACTION_SUMMARY_KEYS[action] ?? "unknown";
}

export function deriveAuditChanges(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): AuditChange[] {
  const fields = [...new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ])].sort();

  const changes: AuditChange[] = [];
  for (const field of fields) {
    const previous = before?.[field];
    const next = after?.[field];
    if (field === "moduleKeys" || field === "permissionKeys") {
      const normalizedPrevious = normalizeAuditKeyList(previous, field);
      const normalizedNext = normalizeAuditKeyList(next, field);
      if (normalizedPrevious === undefined && previous !== undefined) continue;
      if (normalizedNext === undefined && next !== undefined) continue;
      if (JSON.stringify(normalizedPrevious) === JSON.stringify(normalizedNext)) continue;
      changes.push({ field, before: normalizedPrevious, after: normalizedNext });
      continue;
    }
    if ((!isAuditPrimitive(previous) && previous !== undefined)
      || (!isAuditPrimitive(next) && next !== undefined)
      || Object.is(previous, next)) continue;
    changes.push({
      field,
      before: previous as AuditPrimitive | undefined,
      after: next as AuditPrimitive | undefined,
    });
  }
  return changes;
}

function normalizeAuditKeyList(value: unknown, field: "moduleKeys" | "permissionKeys"): string[] | undefined {
  if (value === undefined) return undefined;
  const pattern = field === "moduleKeys" ? /^[a-z][a-z0-9_]{0,63}$/ : /^[a-z][a-z0-9_.:-]{0,127}$/;
  if (!Array.isArray(value) || value.length > 100
    || !value.every((item): item is string => typeof item === "string" && pattern.test(item))) return undefined;
  return [...new Set(value)].sort();
}

export function hasTechnicalAuditPayload(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
) {
  return before !== null || after !== null;
}
