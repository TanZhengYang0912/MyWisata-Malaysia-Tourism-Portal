import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/components/utils';

const pageSource = readFileSync(
  resolve(process.cwd(), 'app/admin/withdrawals/page.tsx'),
  'utf8',
);

describe('withdrawal review action presentation', () => {
  it('keeps the primary action dominant and gives secondary actions explicit treatments', () => {
    expect(pageSource).toContain('border-slate-300');
    expect(pageSource).toContain('border-red-300');
    expect(pageSource).toContain('border-2 border-slate-300');
    expect(pageSource).toContain('border-2 border-red-300');
    expect(pageSource).toContain('bg-red-50');
    expect(pageSource).toContain('borderColor: "#cbd5e1"');
    expect(pageSource).toContain('backgroundColor: "#fef2f2"');

    const holdClasses = cn(buttonVariants({
      variant: 'outline',
      className: 'border-2 border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
    }));
    const rejectClasses = cn(buttonVariants({
      variant: 'outline',
      className: 'border-2 border-red-300 bg-red-50 text-red-700 hover:bg-red-100',
    }));
    expect(holdClasses).toContain('border-2');
    expect(holdClasses).toContain('border-slate-300');
    expect(rejectClasses).toContain('border-2');
    expect(rejectClasses).toContain('bg-red-50');
  });

  it('translates status values in the review summary', () => {
    expect(pageSource).toContain('const displayStatus = (value: string | null | undefined) => value');
    expect(pageSource).toContain('t(ENUM_VALUE_KEYS[value] ?? "withdrawals.status.unknown"');
    expect(pageSource).toContain('{displayStatus(detail.customer.kycStatus)}');
    expect(pageSource).toContain('{displayStatus(detail.riskLevel)}');
  });

  it('renders complete read-only source and fraud review sections', () => {
    expect(pageSource).toContain('t("withdrawals.evidence.rewardSources")');
    expect(pageSource).toContain('t("withdrawals.evidence.affiliateSources")');
    expect(pageSource).toContain('t("withdrawals.evidence.walletTransactions")');
    expect(pageSource).toContain('t("withdrawals.evidence.fraudFlags")');
    expect(pageSource).toContain('detail.reviewSources');
    expect(pageSource).toContain('rewardSources: [], affiliateSources: [], walletTransactions: [], fraudFlags: []');
  });

  it('renders normalized payout failure details for approvers', () => {
    expect(pageSource).toContain('t("withdrawals.payoutFailure.title")');
    expect(pageSource).toContain('detail.payoutFailure');
  });

  it('renders provider proof, ledger evidence, and reconciliation state without a paid action', () => {
    expect(pageSource).toContain('detail.settlementProof');
    expect(pageSource).toContain('withdrawals.settlementProof.noFurtherAction');
    expect(pageSource).toContain('withdrawals.settlementProof.signatureVerified');
    expect(pageSource).toContain('needsReconciliation');
    expect(pageSource).toContain('notification.emailStatus');
    expect(pageSource).not.toContain('Mark Paid');
    expect(pageSource).not.toContain('Simulate Paid');
  });

  it('silently refreshes processing detail until terminal settlement', () => {
    expect(pageSource).toContain('refreshDetail');
    expect(pageSource).toContain('setInterval');
    expect(pageSource).toContain('clearInterval');
    expect(pageSource).toContain('["approved", "processing"].includes(detail.status)');
  });

  it('shows decision-specific reason options only after a decision is selected', () => {
    expect(pageSource).toContain('t("withdrawals.decision.reasonLabel")');
    expect(pageSource).toContain('selectedDecision');
    expect(pageSource).toContain('DECISION_REASON_COPY');
    expect(pageSource).toContain('selectedDecision ?');
    expect(pageSource).not.toContain('Object.keys(WALLET_REASON_RULES).map((key) => [key, ALL_WALLET_REASON_CATEGORIES])');
  });

  it('uses plain-language decision copy and consequences', () => {
    expect(pageSource).toContain('t(DECISION_COPY[decision].descriptionKey)');
    expect(pageSource).toContain('t(DECISION_COPY[decision].consequenceKey)');
    expect(pageSource).toContain('t("withdrawals.decision.afterThis"');
  });

  it('warns administrators when review evidence is unavailable', () => {
    expect(pageSource).toContain('t("withdrawals.evidence.unavailable")');
    expect(pageSource).toContain('t("withdrawals.evidence.doNotApprove")');
    expect(pageSource).toContain('t("withdrawals.evidence.noRewardTransactions")');
  });

  it('provides note examples and a confirmation summary before submission', () => {
    expect(pageSource).toContain('placeholder={t(DECISION_COPY[selectedDecision].placeholderKey)}');
    expect(pageSource).toContain('t("withdrawals.confirmation.title")');
    expect(pageSource).toContain('detail.customer.displayName');
    expect(pageSource).toContain('detail.destinationLabel');
    expect(pageSource).toContain('t("withdrawals.confirmation.confirm")');
    expect(pageSource).toContain('t("withdrawals.confirmation.cancel")');
  });

  it('clears stale errors and confirmation payloads when decision inputs change', () => {
    expect(pageSource).toContain('onChange={(e) => { setReasonCategory(e.target.value); setError(""); setPendingConfirmation(null); }}');
    expect(pageSource).toContain('onChange={(e) => { setReason(e.target.value); setError(""); setPendingConfirmation(null); }}');
  });

  it('shows decision-ready context in the queue before opening a detail drawer', () => {
    expect(pageSource).toContain('t("withdrawals.metrics.pendingPayoutValue")');
    expect(pageSource).toContain('t("withdrawals.table.approvalProgress")');
    expect(pageSource).toContain('t("withdrawals.table.ageSla")');
    expect(pageSource).toContain('t("withdrawals.metrics.dualApproval")');
    expect(pageSource).toContain('t("withdrawals.metrics.highRisk")');
    expect(pageSource).toContain('t("withdrawals.metrics.oldestRequest"');
  });

  it('keeps urgency readable without relying on colour alone', () => {
    expect(pageSource).toContain('labelKey: "withdrawals.priority.needsAction"');
    expect(pageSource).toContain('labelKey: "withdrawals.priority.overdue"');
    expect(pageSource).toContain('labelKey: "withdrawals.priority.waitingForSecondApprover"');
    expect(pageSource).toContain('labelKey: "withdrawals.priority.highRisk"');
    expect(pageSource).toContain('t(priority.labelKey)');
  });
});
