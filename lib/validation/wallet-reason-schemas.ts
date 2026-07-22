import { z } from 'zod';

export const WALLET_REASON_CATEGORIES = {
  hold: ['insufficient_payout_information', 'kyc_or_identity_review', 'risk_review_required', 'payout_account_unavailable', 'other'],
  reject: ['bank_details_mismatch', 'kyc_or_identity_review', 'risk_review_required', 'payout_account_unavailable', 'other'],
  resume: ['additional_information_verified', 'bank_details_confirmed', 'kyc_review_completed', 'risk_review_cleared', 'other'],
  approve: ['review_completed', 'payout_ready', 'other'],
  fraud_override: ['risk_reviewed', 'false_positive', 'exception_approved', 'other'],
  adjustment: ['refund', 'correction', 'compensation', 'chargeback', 'other'],
  settings: ['clearance_window_change', 'threshold_change', 'policy_update', 'other'],
  approver_role: ['role_granted', 'role_revoked', 'coverage_change', 'other'],
} as const;

export type WalletReasonAction = keyof typeof WALLET_REASON_CATEGORIES;
export type WalletReasonCategory = (typeof WALLET_REASON_CATEGORIES)[WalletReasonAction][number];

const actionSchema = z.enum(Object.keys(WALLET_REASON_CATEGORIES) as [WalletReasonAction, ...WalletReasonAction[]]);

export const walletReasonSchema = z.object({
  action: actionSchema,
  reasonCategory: z.string().trim().min(1),
  reason: z.string().trim().min(10).max(500),
}).strict().superRefine((value, ctx) => {
  const allowed = WALLET_REASON_CATEGORIES[value.action] as readonly string[];
  if (!allowed.includes(value.reasonCategory)) {
    ctx.addIssue({
      code: 'custom',
      path: ['reasonCategory'],
      message: `Invalid reason category for ${value.action}`,
    });
  }
});

export function isWalletReasonCategory(action: WalletReasonAction, category: string): category is WalletReasonCategory {
  return (WALLET_REASON_CATEGORIES[action] as readonly string[]).includes(category);
}

