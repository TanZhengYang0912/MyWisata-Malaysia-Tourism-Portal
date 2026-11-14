import { describe, expect, it, vi } from 'vitest';
import { getOrderMoneyReconciliation } from '@/lib/admin/reconciliation';
import { filterOrderReconciliationRows, summarizeOrderReconciliationRows, formatReconciliationSen } from '../reconciliation-filtering';
import type { OrderReconciliationRow } from '../reconciliation';

describe('financial report filtering', () => {
  it('retains the sign of negative financial figures in the existing MYR format', () => {
    expect(formatReconciliationSen(-25)).toBe('−RM0.25');
    expect(formatReconciliationSen(0)).toBe('RM0.00');
    expect(formatReconciliationSen(25)).toBe('RM0.25');
  });
  const rows: OrderReconciliationRow[] = [100, 0, -25].map((net, i) => ({
    orderId: `private-${i}`, orderDisplayId: i === 2 ? null : `ORD-${i}`, status: i === 1 ? 'refunded' : 'paid', paidAt: null,
    grossSen: 1000, platformFeeSen: 100, vendorNetSen: 900, affiliatePayoutSen: 100 - net,
    recommendationPayoutSen: 0, platformNetSen: net, platformNetNegative: net < 0,
  }));
  it('combines normalized display-number search, status and net sign without changing source rows', () => {
    const original = JSON.stringify(rows);
    const result = filterOrderReconciliationRows(rows, { search: ' ord-0 ', status: 'paid', net: 'positive' });
    expect(result).toEqual([rows[0]]);
    expect(summarizeOrderReconciliationRows(result)).toMatchObject({ grossSen: 1000, platformNetSen: 100, negativeOrders: 0 });
    expect(JSON.stringify(rows)).toBe(original);
    expect(filterOrderReconciliationRows(rows, { search: 'private', status: 'all', net: 'all' })).toEqual([]);
  });
  it('includes unnamed orders with empty search and distinguishes zero and negative', () => {
    expect(filterOrderReconciliationRows(rows, { search: '', status: 'all', net: 'negative' })).toEqual([rows[2]]);
    expect(filterOrderReconciliationRows(rows, { search: '', status: 'refunded', net: 'zero' })).toEqual([rows[1]]);
    expect(summarizeOrderReconciliationRows(rows)).toMatchObject({ grossSen: 3000, platformNetSen: 75, negativeOrders: 1 });
    expect(summarizeOrderReconciliationRows([])).toEqual({ grossSen: 0, platformFeeSen: 0, vendorNetSen: 0, affiliatePayoutSen: 0, recommendationPayoutSen: 0, platformNetSen: 0, negativeOrders: 0 });
  });
});

function serviceFor(data: unknown, error: Error | null = null) {
  return { rpc: async () => ({ data, error }) } as never;
}

const RANGE = { fromISO: '2026-03-01T00:00:00.000Z', toISO: '2026-04-01T00:00:00.000Z' };

const row = {
  orderId: 'o1', orderDisplayId: 'MW-1', status: 'paid', paidAt: '2026-03-05T00:00:00.000Z',
  grossSen: 10000, platformFeeSen: 1500, vendorNetSen: 8500, affiliatePayoutSen: 500,
  recommendationPayoutSen: 300, platformNetSen: 700, platformNetNegative: false,
};

const report = {
  rows: [row], totals: { grossSen: 10000, platformFeeSen: 1500, vendorNetSen: 8500, affiliatePayoutSen: 500,
    recommendationPayoutSen: 300, platformNetSen: 700, negativeOrders: 0 },
  total: 1, statusOptions: ['paid'], page: 1, pageSize: 15,
};

describe('getOrderMoneyReconciliation', () => {
  it('throws on report RPC failures instead of returning a zero report', async () => {
    const service = serviceFor(null, new Error('database unavailable'));

    await expect(getOrderMoneyReconciliation(service, RANGE)).rejects.toThrow('Unable to load order reconciliation');
  });

  it('maps the complete RPC report and sends filter and pagination inputs to Postgres', async () => {
    const rpc = vi.fn(async () => ({ data: report, error: null }));
    const result = await getOrderMoneyReconciliation({ rpc } as never, RANGE, {
      filters: { search: ' MW-1 ', status: 'paid', net: 'positive' }, page: 2, pageSize: 25,
    });

    expect(result.rows).toEqual([row]);
    expect(result.totals.platformNetSen).toBe(700);
    expect(result.total).toBe(1);
    expect(rpc).toHaveBeenCalledWith('get_admin_order_money_reconciliation', {
      p_from: RANGE.fromISO, p_to: RANGE.toISO, p_search: 'MW-1', p_status: 'paid', p_net: 'positive', p_page: 2, p_page_size: 25,
    });
  });

  it('rejects page sizes outside the supported server-side contract', async () => {
    await expect(getOrderMoneyReconciliation(serviceFor(report), RANGE, { page: 1, pageSize: 100 }))
      .rejects.toThrow('Invalid reconciliation pagination');
  });
});
