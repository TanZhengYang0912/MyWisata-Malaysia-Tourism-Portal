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
  });

  it('renders normalized payout failure details for approvers', () => {
    expect(pageSource).toContain('Payout failure');
    expect(pageSource).toContain('detail.payoutFailure');
  });
});
