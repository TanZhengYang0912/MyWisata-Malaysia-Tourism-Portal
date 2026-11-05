import { describe, expect, it } from 'vitest';
import * as dashboardMetrics from '@/lib/vendor/dashboard-metrics';

const summarizeDashboardPayments = (dashboardMetrics as unknown as {
  summarizeDashboardPayments?: (payments: Array<{ status: string; provider: string; is_live: boolean }>) => unknown;
}).summarizeDashboardPayments;
const summarizePaymentRecords = (payments: Array<{ status: string; provider: string; is_live: boolean }>) => summarizeDashboardPayments?.(payments);
const { allocateDashboardRevenue, classifyDashboardSale, matchesDashboardSalesMode, normalizeDashboardSalesMode } = dashboardMetrics;

describe('dashboard sales modes', () => {
  it('defaults absent, malformed and repeated mode parameters to real sales', () => {
    for (const value of [undefined, null, '', 'all', 'DEMO', ['demo', 'live']]) {
      expect(normalizeDashboardSalesMode(value)).toBe('live');
    }
    expect(normalizeDashboardSalesMode('demo')).toBe('demo');
  });

  it('keeps live and test/demo views separate and excludes unresolved sales', () => {
    expect(matchesDashboardSalesMode('verified', 'live')).toBe(true);
    expect(matchesDashboardSalesMode('simulated', 'demo')).toBe(true);
    expect(matchesDashboardSalesMode('verified', 'demo')).toBe(false);
    expect(matchesDashboardSalesMode('simulated', 'live')).toBe(false);
    for (const sale of ['unverified', 'excluded'] as const) {
      expect(matchesDashboardSalesMode(sale, 'live')).toBe(false);
      expect(matchesDashboardSalesMode(sale, 'demo')).toBe(false);
    }
  });
});

describe('classifyDashboardSale', () => {
  it('counts only paid or completed orders with a successful live payment as verified', () => {
    expect(classifyDashboardSale('paid', [{ status: 'succeeded', is_live: true, provider: 'stripe' }])).toBe('verified');
    expect(classifyDashboardSale('completed', [{ status: 'succeeded', is_live: true, provider: 'stripe' }])).toBe('verified');
  });

  it('keeps simulator, test-mode, and inconsistent demo payments out of verified sales', () => {
    expect(classifyDashboardSale('paid', [{ status: 'succeeded', is_live: false, provider: 'stripe' }])).toBe('simulated');
    expect(classifyDashboardSale('completed', [{ status: 'succeeded', is_live: false, provider: 'tng_ewallet_simulator' }])).toBe('simulated');
    expect(classifyDashboardSale('paid', [{ status: 'succeeded', is_live: true, provider: 'demo' }])).toBe('simulated');
  });

  it('does not report paid/completed orders without a successful payment as sales', () => {
    expect(classifyDashboardSale('paid', [])).toBe('unverified');
    expect(classifyDashboardSale('completed', [{ status: 'pending', is_live: true, provider: 'stripe' }])).toBe('unverified');
  });

  it('requires explicit payment provenance, normalizes demo providers, and accepts test plus demo', () => {
    for (const payment of [
      { status: 'succeeded', provider: 'other' },
      { status: 'succeeded', is_live: true },
      { status: 'succeeded', provider: ' ', is_live: false },
    ]) expect(classifyDashboardSale('paid', [payment])).toBe('unverified');
    expect(classifyDashboardSale('paid', [{ status: 'succeeded', provider: ' DEMO ', is_live: true }])).toBe('simulated');
    expect(classifyDashboardSale('paid', [
      { status: 'succeeded', provider: 'demo', is_live: false },
      { status: 'succeeded', provider: 'test-provider', is_live: false },
    ])).toBe('simulated');
    expect(classifyDashboardSale('paid', [
      { status: 'succeeded', provider: 'test-provider', is_live: false },
      { status: 'succeeded', provider: 'unknown' },
    ])).toBe('unverified');
  });

  it('excludes cancelled, refunded, and unpaid orders from every sales class', () => {
    for (const status of ['cancelled', 'refunded', 'pending', 'failed']) {
      expect(classifyDashboardSale(status, [{ status: 'succeeded', is_live: true, provider: 'stripe' }])).toBe('excluded');
    }
  });

  it('treats mixed live and simulated successful payments as unverified attribution', () => {
    expect(classifyDashboardSale('paid', [
      { status: 'succeeded', is_live: true, provider: 'stripe' },
      { status: 'succeeded', is_live: false, provider: 'wallet' },
    ])).toBe('unverified');
  });
});

describe('allocateDashboardRevenue', () => {
  it('allocates discounted paid totals by line subtotal while preserving cents', () => {
    const revenue = allocateDashboardRevenue([
      { id: 'line-a', order_id: 'order-1', line_total: 30, orders: { subtotal: 60, total_amount: 50 } },
      { id: 'line-b', order_id: 'order-1', line_total: 30, orders: { subtotal: 60, total_amount: 50 } },
    ]);

    expect(revenue.get('line-a')).toBe(25);
    expect(revenue.get('line-b')).toBe(25);
    expect([...revenue.values()].reduce((sum, amount) => sum + amount, 0)).toBe(50);
  });

  it('allocates only the visible outlet share when an order spans other vendors or outlets', () => {
    const revenue = allocateDashboardRevenue([
      { id: 'line-visible', order_id: 'order-1', line_total: 20, orders: { subtotal: 100, total_amount: 80 } },
    ]);

    expect(revenue.get('line-visible')).toBe(16);
  });

  it('returns zero rather than inventing gross sales when order subtotal is unavailable', () => {
    const revenue = allocateDashboardRevenue([
      { id: 'line-a', order_id: 'order-1', line_total: 30, orders: { total_amount: 25 } },
    ]);

    expect(revenue.get('line-a')).toBe(0);
  });
});

describe('summarizeDashboardPayments', () => {
  it('identifies successful demo payments separately from payment status', () => {
    expect(summarizePaymentRecords([
      { status: 'succeeded', provider: 'demo', is_live: false },
    ])).toEqual({ status: 'succeeded', mode: 'demo', provider: 'demo' });
  });

  it('identifies a successful Stripe test-mode payment', () => {
    expect(summarizePaymentRecords([
      { status: 'succeeded', provider: 'stripe', is_live: false },
    ])).toEqual({ status: 'succeeded', mode: 'test', provider: 'stripe' });
  });

  it('identifies a live payment and ignores failed retries when a success exists', () => {
    expect(summarizePaymentRecords([
      { status: 'failed', provider: 'stripe', is_live: false },
      { status: 'succeeded', provider: 'stripe', is_live: true },
    ])).toEqual({ status: 'succeeded', mode: 'live', provider: 'stripe' });
  });

  it('marks conflicting successful payment sources as mixed', () => {
    expect(summarizePaymentRecords([
      { status: 'succeeded', provider: 'stripe', is_live: true },
      { status: 'succeeded', provider: 'demo', is_live: false },
    ])).toEqual({ status: 'succeeded', mode: 'mixed', provider: 'mixed' });
  });

  it('retains the observed attempt status and reports missing payment records explicitly', () => {
    expect(summarizePaymentRecords([
      { status: 'pending', provider: 'stripe', is_live: false },
    ])).toEqual({ status: 'pending', mode: 'test', provider: 'stripe' });
    expect(summarizePaymentRecords([])).toEqual({ status: 'not_recorded', mode: 'unknown', provider: 'unknown' });
  });
});
