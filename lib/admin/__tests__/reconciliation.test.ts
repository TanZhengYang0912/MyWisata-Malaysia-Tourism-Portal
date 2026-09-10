import { describe, expect, it } from 'vitest';
import { getOrderMoneyReconciliation } from '@/lib/admin/reconciliation';

function serviceFor(opts: {
  settlements: unknown[];
  affiliate?: unknown[];
  recommendation?: unknown[];
}) {
  return {
    from(table: string) {
      if (table === 'order_settlements') {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.gte = () => chain;
        chain.lt = () => chain;
        chain.limit = async () => ({ data: opts.settlements, error: null });
        return chain;
      }
      if (table === 'affiliate_attributions') {
        return { select: () => ({ in: async () => ({ data: opts.affiliate ?? [] }) }) };
      }
      if (table === 'recommendation_commissions') {
        return { select: () => ({ in: async () => ({ data: opts.recommendation ?? [] }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as never;
}

const RANGE = { fromISO: '2026-03-01T00:00:00.000Z', toISO: '2026-04-01T00:00:00.000Z' };

function settlement(o: Record<string, unknown> = {}) {
  return {
    order_id: 'o1',
    gross_sen: 10000,
    platform_fee_sen: 1500,
    vendor_net_sen: 8500,
    reversed_amount_sen: 0,
    orders: { display_id: 'MW-1', status: 'paid', paid_at: '2026-03-05T00:00:00.000Z', created_at: '2026-03-05T00:00:00.000Z' },
    ...o,
  };
}

describe('getOrderMoneyReconciliation', () => {
  it('nets platform fee against affiliate + recommendation payouts per order', async () => {
    const service = serviceFor({
      settlements: [settlement()],
      affiliate: [{ order_id: 'o1', commission_amount: 5, status: 'pending' }], // RM5 = 500 sen
      recommendation: [{ order_id: 'o1', amount: 3, status: 'pending' }], // RM3 = 300 sen
    });
    const result = await getOrderMoneyReconciliation(service, RANGE);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      platformFeeSen: 1500, affiliatePayoutSen: 500, recommendationPayoutSen: 300,
      platformNetSen: 700, platformNetNegative: false,
    });
    expect(result.totals.platformNetSen).toBe(700);
    expect(result.totals.negativeOrders).toBe(0);
  });

  it('flags an order whose referral payouts exceed the commission collected', async () => {
    const service = serviceFor({
      settlements: [settlement({ platform_fee_sen: 300 })],
      recommendation: [{ order_id: 'o1', amount: 50, status: 'pending' }], // RM50 first-sale bonus
    });
    const result = await getOrderMoneyReconciliation(service, RANGE);
    expect(result.rows[0].platformNetSen).toBe(300 - 5000);
    expect(result.rows[0].platformNetNegative).toBe(true);
    expect(result.totals.negativeOrders).toBe(1);
  });

  it('excludes reversed/rejected referral rows and reversed settlement amounts', async () => {
    const service = serviceFor({
      settlements: [settlement({ reversed_amount_sen: 8500 })],
      affiliate: [{ order_id: 'o1', commission_amount: 5, status: 'reversed' }],
      recommendation: [{ order_id: 'o1', amount: 3, status: 'reversed' }],
    });
    const result = await getOrderMoneyReconciliation(service, RANGE);
    expect(result.rows[0].vendorNetSen).toBe(0);
    expect(result.rows[0].affiliatePayoutSen).toBe(0);
    expect(result.rows[0].recommendationPayoutSen).toBe(0);
    expect(result.rows[0].platformNetSen).toBe(1500);
  });

  it('sums multiple vendor settlements on one order', async () => {
    const service = serviceFor({
      settlements: [
        settlement({ gross_sen: 6000, platform_fee_sen: 900, vendor_net_sen: 5100 }),
        settlement({ gross_sen: 4000, platform_fee_sen: 600, vendor_net_sen: 3400 }),
      ],
    });
    const result = await getOrderMoneyReconciliation(service, RANGE);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].grossSen).toBe(10000);
    expect(result.rows[0].platformFeeSen).toBe(1500);
    expect(result.rows[0].vendorNetSen).toBe(8500);
  });
});
