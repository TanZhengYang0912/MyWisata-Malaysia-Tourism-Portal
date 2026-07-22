// Pure risk-level mapping. Database `assess_withdrawal_risk()` is authoritative;
// this module is used only by unit tests and the route to read the snapshot.

export type WithdrawalRiskLevel = 'low' | 'review' | 'high';

export interface WithdrawalRiskSnapshot {
  kycStatus: string | null;
  payoutsEnabled: boolean;
  amountSen: number;
  dualApprovalThresholdSen: number;
  recentFailedCount: number;
  activeRequestCount: number;
  accountAgeDays: number;
}

/**
 * Map factual snapshot fields to a risk level.
 * Rules (ordered from highest to lowest severity):
 *   HIGH  — KYC not approved, payouts disabled, ≥3 recent failures, or >1 active request
 *   REVIEW — amount ≥ dual-approval threshold, 1–2 recent failures, or account age < 30 days
 *   LOW   — everything else
 */
export function computeRiskLevel(s: WithdrawalRiskSnapshot): WithdrawalRiskLevel {
  if (
    s.kycStatus !== 'approved' ||
    !s.payoutsEnabled ||
    s.recentFailedCount >= 3 ||
    s.activeRequestCount > 1
  ) {
    return 'high';
  }
  if (
    s.amountSen >= s.dualApprovalThresholdSen ||
    s.recentFailedCount >= 1 ||
    s.accountAgeDays < 30
  ) {
    return 'review';
  }
  return 'low';
}
