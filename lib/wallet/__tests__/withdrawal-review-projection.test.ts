import { describe, expect, it } from 'vitest';
import { buildWithdrawalNotificationReason } from '../withdrawal-review-projection';

describe('withdrawal review projection', () => {
  it('builds a redacted approver summary from the immutable withdrawal snapshot', () => {
    const summary = buildWithdrawalNotificationReason({
      customer: { id: 'customer-1', displayName: 'Customer', email: 'customer@example.test' },
      requestTime: '2026-07-22T04:00:00.000Z',
      kycStatus: 'approved',
      risk: { level: 'review', reasons: ['recent_failed_withdrawal'] },
      sourceTotals: { rewardSen: 2500, affiliateSen: 5000, otherSen: 0 },
      destination: { type: 'e_wallet', maskedReference: '+60••••6789' },
    });

    expect(summary).toContain('Customer: Customer');
    expect(summary).toContain('Risk: review');
    expect(summary).toContain('Reward sources: RM25.00');
    expect(summary).toContain('Affiliate sources: RM50.00');
    expect(summary).toContain('Destination: e_wallet +60••••6789');
    expect(summary).not.toContain('customer@example.test');
  });
});
