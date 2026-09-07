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
  before: AuditPrimitive | undefined;
  after: AuditPrimitive | undefined;
};

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

  return fields.flatMap((field) => {
    const previous = before?.[field];
    const next = after?.[field];
    if ((!isAuditPrimitive(previous) && previous !== undefined)
      || (!isAuditPrimitive(next) && next !== undefined)
      || Object.is(previous, next)) return [];
    return [{
      field,
      before: previous as AuditPrimitive | undefined,
      after: next as AuditPrimitive | undefined,
    }];
  });
}

export function hasTechnicalAuditPayload(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
) {
  return before !== null || after !== null;
}
