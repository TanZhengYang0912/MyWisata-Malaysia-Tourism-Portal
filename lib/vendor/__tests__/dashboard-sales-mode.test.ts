import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), service: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.auth }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: mocks.service }));
import { getVendorDashboardData } from '@/lib/vendor-dashboard';

type Row = Record<string, unknown>;
type Payment = { status: string; provider?: string; is_live?: boolean };
const live: Payment[] = [{ status: 'succeeded', provider: 'bank_transfer', is_live: true }];
const demo: Payment[] = [{ status: 'succeeded', provider: 'demo', is_live: false }];
const testPayment: Payment[] = [{ status: 'succeeded', provider: 'test-provider', is_live: false }];
function line(id: string, order: string, amount: number, payments: Payment[], status = 'paid', date = '2026-10-20T04:00:00Z'): Row {
  return { id, order_id: order, outlet_id: 'outlet-a', product_id: id, product_name: id, quantity: 1, line_total: amount, fulfil_status: 'pending', created_at: date, orders: { status, subtotal: amount, total_amount: amount, payments } };
}
function query(rows: Row[], calls: Array<[string, string, unknown]>) {
  let selected = rows;
  const nested = (row: Row, field: string): unknown => field.split('.').reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as Row)[key] : undefined, row);
  const builder = {
    select: (_columns: string) => builder,
    eq: (field: string, value: unknown) => { calls.push(['eq', field, value]); selected = selected.filter(row => nested(row, field) === value); return builder; },
    in: (field: string, values: unknown[]) => { calls.push(['in', field, values]); selected = selected.filter(row => values.includes(nested(row, field))); return builder; },
    gte: (field: string, value: string) => { selected = selected.filter(row => String(nested(row, field)) >= value); return builder; },
    lte: (field: string, value: string) => { selected = selected.filter(row => String(nested(row, field)) <= value); return builder; },
    order: (_field: string, _options?: unknown) => builder,
    or: (_filter: string) => builder,
    limit: (count: number) => { selected = selected.slice(0, count); return builder; },
    then: (resolve: (value: { data: Row[]; error: null }) => unknown) => Promise.resolve({ data: selected, error: null }).then(resolve),
  };
  return builder;
}

let rows: Row[];
let outlets: Row[];
let manager = false;
let loggedIn = true;
let reads: Array<{ table: string; calls: Array<[string, string, unknown]> }>;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-31T04:00:00Z'));
  manager = false; loggedIn = true; reads = [];
  outlets = [{ id: 'outlet-a', vendor_id: 'vendor-a', name: 'Example — City', status: 'active' }];
  rows = [
    line('live-current', 'live-order', 100, live),
    { ...line('demo-a', 'demo-order', 30, demo), quantity: 2, orders: { status: 'paid', subtotal: 40, total_amount: 32, payments: demo } },
    { ...line('demo-b', 'demo-order', 10, demo), orders: { status: 'paid', subtotal: 40, total_amount: 32, payments: demo } },
    line('test-current', 'test-order', 10, testPayment, 'completed'),
    line('live-previous', 'live-prev', 50, live, 'paid', '2026-09-20T04:00:00Z'),
    line('demo-previous', 'demo-prev', 21, demo, 'paid', '2026-09-20T04:00:00Z'),
    ...['pending', 'failed', 'cancelled', 'refunded'].map(status => line(status, status, 999, demo, status)),
    line('unverified', 'unverified', 999, []),
    line('unknown', 'unknown', 999, [{ status: 'succeeded', provider: 'unknown' }]),
    line('mixed', 'mixed', 999, [...live, ...demo]),
    { ...line('other-vendor', 'other-vendor', 999, demo), outlet_id: 'outlet-foreign' },
  ];
  mocks.auth.mockImplementation(async () => ({
    auth: { getUser: async () => ({ data: { user: loggedIn ? { id: 'user-a' } : null } }) },
    from: (table: string) => query(table === 'vendors' ? [{ id: 'vendor-a', owner_id: manager ? 'another-owner' : 'user-a', status: 'approved', name: 'Example' }] : [{ user_id: 'user-a', outlet_id: 'outlet-a', outlets: { vendor_id: 'vendor-a' } }], []),
  }));
  mocks.service.mockImplementation(() => ({ from: (table: string) => {
    const calls: Array<[string, string, unknown]> = [];
    reads.push({ table, calls });
    return query(table === 'outlets' ? outlets : table === 'order_items' ? rows : [], calls);
  } }));
});
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe('dashboard sales selection through the existing scoped aggregation', () => {
  it('defaults to live totals and consistently isolates test/demo amounts across every sales output', async () => {
    const actual = await getVendorDashboardData('30d');
    const liveReadCount = reads.length;
    reads = [];
    const simulated = await getVendorDashboardData('30d', undefined, 'demo');
    expect(actual?.stats.totalRevenue).toBe(100);
    expect(actual?.topSelling.map(row => row.name)).toEqual(['live-current']);
    expect(actual?.chart.reduce((sum, row) => sum + row.revenue, 0)).toBe(100);
    expect(simulated?.salesMode).toBe('demo');
    expect(simulated?.stats).toMatchObject({ totalRevenue: 42, revenueGrowth: 100, simulatedRevenue: 42, simulatedOrders: 2 });
    expect(simulated?.chart.reduce((sum, row) => sum + row.revenue, 0)).toBe(42);
    expect(simulated?.chart.reduce((sum, row) => sum + row.orders, 0)).toBe(2);
    expect(simulated?.totalProductSales).toBe(42);
    expect(simulated?.totalOutletSales).toBe(42);
    expect(simulated?.salesByProduct.find(row => row.name === 'demo-a')?.revenue).toBe(24);
    expect(simulated?.topSelling[0]).toMatchObject({ name: 'demo-a', quantity: 2, revenue: 24 });
    expect(simulated?.stats.totalOrders).toBe(actual?.stats.totalOrders);
    expect(simulated?.stats.pendingOrders).toBe(actual?.stats.pendingOrders);
    expect(reads).toHaveLength(liveReadCount);
    expect(reads.filter(read => read.table === 'order_items').every(read => read.calls.some(([op, field, values]) => op === 'in' && field === 'outlet_id' && JSON.stringify(values) === '["outlet-a"]'))).toBe(true);
  });

  it('keeps outlet managers restricted to assigned outlets in demo mode', async () => {
    manager = true;
    outlets.push({ id: 'outlet-b', vendor_id: 'vendor-a', name: 'Unassigned', status: 'active' });
    rows.push({ ...line('unassigned', 'unassigned', 900, demo), outlet_id: 'outlet-b' });
    const result = await getVendorDashboardData('30d', undefined, 'demo');
    expect(result?.role).toBe('outlet_manager');
    expect(result?.stats.totalRevenue).toBe(42);
    expect(result?.topSelling.some(row => row.name === 'unassigned')).toBe(false);
    expect(reads.filter(read => read.table === 'order_items').every(read => read.calls.some(([op, field, values]) => op === 'in' && field === 'outlet_id' && JSON.stringify(values) === '["outlet-a"]'))).toBe(true);
  });

  it('respects custom dates and excludes orders outside the selected period', async () => {
    const result = await getVendorDashboardData('custom', { from: '2026-10-21', to: '2026-10-22' }, 'demo');
    expect(result?.stats.totalRevenue).toBe(0);
    expect(result?.chart).toEqual([]);
    expect(result?.topSelling).toEqual([]);
  });

  it('does not access service data without an authenticated user', async () => {
    loggedIn = false;
    expect(await getVendorDashboardData('30d', undefined, 'demo')).toBeNull();
    expect(mocks.service).not.toHaveBeenCalled();
  });
});
