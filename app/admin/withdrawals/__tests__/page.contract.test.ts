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

  it('title-cases status values in the review summary', () => {
    expect(pageSource).toContain('titleCaseStatus');
    expect(pageSource).toContain('{titleCaseStatus(detail.customer.kycStatus)}');
    expect(pageSource).toContain('{titleCaseStatus(detail.riskLevel)}');
  });

  it('renders complete read-only source and fraud review sections', () => {
    expect(pageSource).toContain('Reward sources');
    expect(pageSource).toContain('Affiliate sources');
    expect(pageSource).toContain('Wallet transaction history');
    expect(pageSource).toContain('Fraud flags');
    expect(pageSource).toContain('detail.reviewSources');
    expect(pageSource).toContain('rewardSources: [], affiliateSources: [], walletTransactions: [], fraudFlags: []');
  });

  it('renders normalized payout failure details for approvers', () => {
    expect(pageSource).toContain('Payout failure');
    expect(pageSource).toContain('detail.payoutFailure');
  });

  it('shows decision-specific reason options only after a decision is selected', () => {
    expect(pageSource).toContain('Reason for this decision');
    expect(pageSource).toContain('selectedDecision');
    expect(pageSource).toContain('DECISION_REASON_COPY');
    expect(pageSource).toContain('selectedDecision ?');
    expect(pageSource).not.toContain('Object.keys(WALLET_REASON_RULES).map((key) => [key, ALL_WALLET_REASON_CATEGORIES])');
  });

  it('uses plain-language decision copy and consequences', () => {
    expect(pageSource).toContain('Payout details are ready');
    expect(pageSource).toContain('Additional risk review required');
    expect(pageSource).toContain('Keep the reserved funds held');
    expect(pageSource).toContain('Return the reserved amount to available balance');
  });

  it('warns administrators when review evidence is unavailable', () => {
    expect(pageSource).toContain('Review data is currently unavailable');
    expect(pageSource).toContain('Do not approve until the data is available');
    expect(pageSource).toContain('No reward transactions were found');
  });

  it('provides note examples and a confirmation summary before submission', () => {
    expect(pageSource).toContain('Example: KYC, wallet balance and payout destination were reviewed and verified.');
    expect(pageSource).toContain('Confirm withdrawal decision');
    expect(pageSource).toContain('detail.customer.displayName');
    expect(pageSource).toContain('detail.destinationLabel');
    expect(pageSource).toContain('Confirm decision');
    expect(pageSource).toContain('Cancel');
  });
});
