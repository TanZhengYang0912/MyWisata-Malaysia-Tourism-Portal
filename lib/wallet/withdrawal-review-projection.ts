export type WithdrawalNotificationSnapshot = {
  customer: { id: string; displayName: string; email: string | null };
  requestTime: string;
  kycStatus: string;
  risk: { level: string; reasons: string[] };
  sourceTotals: { rewardSen: number; affiliateSen: number; otherSen: number };
  destination: { type: string; maskedReference: string };
};

import { formatMYRFromSen } from "@/lib/i18n/format";

function safeLabel(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80) || 'Unknown';
}

function formatSen(value: number): string {
  return formatMYRFromSen(Math.max(0, value));
}

export function buildWithdrawalNotificationReason(snapshot: WithdrawalNotificationSnapshot): string {
  const reasons = snapshot.risk.reasons.map(safeLabel).join(', ') || 'No elevated factors';
  return [
    `Customer: ${safeLabel(snapshot.customer.displayName)}`,
    `KYC: ${safeLabel(snapshot.kycStatus)}`,
    `Risk: ${safeLabel(snapshot.risk.level)} (${reasons})`,
    `Reward sources: ${formatSen(snapshot.sourceTotals.rewardSen)}`,
    `Affiliate sources: ${formatSen(snapshot.sourceTotals.affiliateSen)}`,
    `Other sources: ${formatSen(snapshot.sourceTotals.otherSen)}`,
    `Destination: ${safeLabel(snapshot.destination.type)} ${safeLabel(snapshot.destination.maskedReference)}`,
    `Request time: ${snapshot.requestTime}`,
  ].join(' | ');
}

export function buildWithdrawalNotificationMetadata(snapshot: WithdrawalNotificationSnapshot) {
  return {
    customer_id: snapshot.customer.id,
    customer_display_name: safeLabel(snapshot.customer.displayName),
    request_time: snapshot.requestTime,
    kyc_status: safeLabel(snapshot.kycStatus),
    risk_level: safeLabel(snapshot.risk.level),
    risk_reasons: snapshot.risk.reasons.map(safeLabel),
    reward_source_sen: Math.max(0, snapshot.sourceTotals.rewardSen),
    affiliate_source_sen: Math.max(0, snapshot.sourceTotals.affiliateSen),
    other_source_sen: Math.max(0, snapshot.sourceTotals.otherSen),
    destination_type: safeLabel(snapshot.destination.type),
    destination_masked_ref: safeLabel(snapshot.destination.maskedReference),
  };
}
