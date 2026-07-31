import { describe, expect, it } from 'vitest';
import { aggregateVoucherAnalytics } from '@/lib/vendor/voucher-analytics';

describe('aggregateVoucherAnalytics', () => {
  it('counts funnel events, unique customers, sales and net revenue impact', () => {
    const rows = aggregateVoucherAnalytics(
      [{ id: 'v1', code: 'TRAVEL001', name: 'Travel', maxUses: 10, outletName: 'KLCC' }],
      [
        { voucherId: 'v1', eventType: 'viewed', userId: 'u1' },
        { voucherId: 'v1', eventType: 'entered', userId: 'u1' },
        { voucherId: 'v1', eventType: 'apply_success', userId: 'u1' },
        { voucherId: 'v1', eventType: 'entered', userId: 'u2' },
      ],
      [{ voucherId: 'v1', discount: 10, revenue: 90, userId: 'u1' }],
    );

    expect(rows[0]).toMatchObject({ views: 1, entries: 2, applies: 1, redemptions: 1, uniqueCustomers: 2, discount: 10, revenue: 90, revenueImpact: 80, redemptionRate: 10 });
  });

  it('keeps vouchers with no events and marks unlimited redemption rate as null', () => {
    const rows = aggregateVoucherAnalytics(
      [{ id: 'v2', code: 'OPEN', name: 'Open', maxUses: null, outletName: 'All outlets' }],
      [],
      [],
    );

    expect(rows[0]).toMatchObject({ views: 0, entries: 0, applies: 0, redemptions: 0, uniqueCustomers: 0, redemptionRate: null, revenueImpact: 0 });
  });
});
