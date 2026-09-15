import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getVendorSettlements } from '@/lib/vendor/settlement';

function serviceFor(rows: unknown[], error: unknown = null) {
  const order = vi.fn(async () => ({ data: error ? null : rows, error }));
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  return { service: { from: vi.fn(() => ({ select })) } as never, eq };
}

function row(o: Record<string, unknown> = {}) {
  return {
    id: 's1',
    order_id: 'o1',
    gross_sen: 10000,
    platform_fee_sen: 1500,
    vendor_net_sen: 8500,
    platform_rate: 0.15,
    status: 'pending',
    hold_until: '2026-03-15T00:00:00.000Z',
    reversed_amount_sen: 0,
    created_at: '2026-03-05T00:00:00.000Z',
    orders: { display_id: 'MW-1001' },
    ...o,
  };
}

describe('getVendorSettlements', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T00:00:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('buckets pending / confirmed / reversed and totals net of reversals', async () => {
    const { service } = serviceFor([
      row({ id: 'a', status: 'pending', vendor_net_sen: 8500 }),
      row({ id: 'b', status: 'confirmed', vendor_net_sen: 4000, hold_until: null }),
      row({ id: 'c', status: 'reversed', vendor_net_sen: 2000, reversed_amount_sen: 2000, hold_until: null }),
      row({ id: 'd', status: 'confirmed', vendor_net_sen: 5000, reversed_amount_sen: 1000, hold_until: null }),
    ]);
    const result = await getVendorSettlements(service, 'vendor-1');

    expect(result.totals.pendingSen).toBe(8500);
    expect(result.totals.clearedSen).toBe(4000 + (5000 - 1000));
    expect(result.totals.lifetimePlatformFeesSen).toBe(1500 * 3); // reversed row excluded
    expect(result.settlements.map((s) => s.status)).toEqual(['pending', 'confirmed', 'reversed', 'confirmed']);
  });

  it('derives clearsInDays from hold_until for pending rows only', async () => {
    const { service } = serviceFor([
      row({ id: 'a', status: 'pending', hold_until: '2026-03-15T00:00:00.000Z' }),
      row({ id: 'b', status: 'confirmed', hold_until: '2026-03-20T00:00:00.000Z' }),
    ]);
    const [a, b] = (await getVendorSettlements(service, 'vendor-1')).settlements;
    expect(a.clearsInDays).toBe(5);
    expect(b.clearsInDays).toBeNull();
  });

  it('scopes the query to the vendor and returns empty on error', async () => {
    const { service, eq } = serviceFor([], { message: 'boom' });
    const result = await getVendorSettlements(service, 'vendor-9');
    expect(eq).toHaveBeenCalledWith('vendor_id', 'vendor-9');
    expect(result).toEqual({ totals: { pendingSen: 0, clearedSen: 0, lifetimePlatformFeesSen: 0 }, settlements: [] });
  });
});
