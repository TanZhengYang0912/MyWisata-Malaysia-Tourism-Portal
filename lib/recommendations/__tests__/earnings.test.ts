import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRecommendationEarnings } from '@/lib/recommendations/earnings';

const USER = 'rec-user-1';

function serviceFor(rows: unknown[], error: unknown = null) {
  const order = vi.fn(async () => ({ data: error ? null : rows, error }));
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { service: { from } as never, from, select, eq, order };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    conversion_id: 'conv-1',
    commission_type: 'ongoing',
    amount: 18,
    commission_rate: 0.03,
    status: 'pending',
    hold_until: null,
    created_at: '2026-03-05T00:00:00.000Z',
    recommendation_conversions: {
      recommendation_id: 'rec-1',
      vendor_recommendations: { id: 'rec-1', vendor_name: 'Aunty Lim Kitchen' },
    },
    ...overrides,
  };
}

describe('getRecommendationEarnings', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T00:00:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('buckets pending / confirmed / reversed and totals only the active ones', async () => {
    const { service } = serviceFor([
      row({ id: 'a', status: 'pending', amount: 12.5, commission_type: 'bonus', commission_rate: null, hold_until: '2026-03-15T00:00:00.000Z', conversion_id: 'conv-a' }),
      row({ id: 'b', status: 'confirmed', amount: 18, conversion_id: 'conv-b' }),
      row({ id: 'c', status: 'reversed', amount: 9.75, conversion_id: 'conv-c' }),
    ]);

    const result = await getRecommendationEarnings(service, USER);

    expect(result.totals).toEqual({ pending: 12.5, lifetimeCleared: 18, convertedVendors: 2 });
    expect(result.commissions.map((c) => c.status)).toEqual(['pending', 'confirmed', 'reversed']);
  });

  it('derives clearsInDays from hold_until for pending rows only', async () => {
    const { service } = serviceFor([
      row({ id: 'a', status: 'pending', hold_until: '2026-03-15T00:00:00.000Z' }), // 5 days out
      row({ id: 'b', status: 'pending', hold_until: '2026-03-01T00:00:00.000Z' }), // already past -> 0
      row({ id: 'c', status: 'confirmed', hold_until: '2026-03-20T00:00:00.000Z' }),
    ]);

    const [a, b, c] = (await getRecommendationEarnings(service, USER)).commissions;
    expect(a.clearsInDays).toBe(5);
    expect(b.clearsInDays).toBe(0);
    expect(c.clearsInDays).toBeNull();
  });

  it('maps vendor name + recommendation id, tolerating a missing join', async () => {
    const { service } = serviceFor([
      row({ id: 'a' }),
      row({ id: 'b', recommendation_conversions: null }),
    ]);

    const [a, b] = (await getRecommendationEarnings(service, USER)).commissions;
    expect(a).toMatchObject({ vendorName: 'Aunty Lim Kitchen', recommendationId: 'rec-1', type: 'ongoing', rate: 0.03 });
    expect(b).toMatchObject({ vendorName: null, recommendationId: null });
  });

  it('scopes the query to the recommender and returns empty on error', async () => {
    const { service, eq } = serviceFor([], { message: 'boom' });
    const result = await getRecommendationEarnings(service, USER);
    expect(eq).toHaveBeenCalledWith('recommender_id', USER);
    expect(result).toEqual({ totals: { pending: 0, lifetimeCleared: 0, convertedVendors: 0 }, commissions: [] });
  });
});
