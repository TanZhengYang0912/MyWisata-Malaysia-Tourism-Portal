import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const mocks = vi.hoisted(() => ({
  getClearanceDays: vi.fn(),
  getTierForUser: vi.fn(),
  resolveProductNames: vi.fn(),
  createServiceClient: vi.fn(),
}));

vi.mock('../settings', () => ({ getClearanceDays: mocks.getClearanceDays }));
vi.mock('../tier', () => ({ getTierForUser: mocks.getTierForUser }));
vi.mock('../product-names', () => ({ resolveProductNames: mocks.resolveProductNames }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: mocks.createServiceClient }));

const { getAffiliateStats } = await import('../stats');

interface Attribution {
  id: string; click_id: string; order_id: string; commission_rate: number;
  commission_amount: number; status: string; created_at: string; cleared_at: string | null;
}

function makeService(attributions: Attribution[], targetIdByClick: Record<string, string> = {}): SupabaseClient {
  const clickRows = [...new Set(attributions.map((a) => a.click_id))].map((id) => ({
    id, target_type: 'product', target_id: targetIdByClick[id] ?? null, source: null, campaign: null, created_at: '2026-09-01T00:00:00Z',
  }));
  return {
    from: (table: string) => {
      if (table === 'affiliate_links') {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'link-1', affiliate_code: 'AF-TEST01' } }) }) }) };
      }
      if (table === 'affiliate_clicks') {
        return { select: () => ({ eq: () => Promise.resolve({ data: clickRows }) }) };
      }
      if (table === 'share_events') {
        return { select: () => ({ eq: () => Promise.resolve({ data: [] }) }) };
      }
      if (table === 'wallets') {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { earnings_sen: 3000 } }) }) }) };
      }
      if (table === 'affiliate_attributions') {
        return { select: () => ({ in: () => Promise.resolve({ data: attributions }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as unknown as SupabaseClient;
}

describe('getAffiliateStats — totalEarnings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getClearanceDays.mockResolvedValue(7);
    mocks.getTierForUser.mockResolvedValue({ tierName: 'standard', rate: 0.03, referralCount: 0, nextTier: null, referralsToNext: null });
    mocks.resolveProductNames.mockResolvedValue(new Map());
    mocks.createServiceClient.mockReturnValue({ from: () => ({ select: () => ({ in: () => Promise.resolve({ data: [] }) }) }) });
  });

  it('sums pending + confirmed commission, excluding reversed and rejected', async () => {
    const attributions: Attribution[] = [
      { id: 'a1', click_id: 'c1', order_id: 'o1', commission_rate: 0.03, commission_amount: 10, status: 'pending', created_at: '2026-09-01T00:00:00Z', cleared_at: null },
      { id: 'a2', click_id: 'c2', order_id: 'o2', commission_rate: 0.03, commission_amount: 20, status: 'confirmed', created_at: '2026-09-02T00:00:00Z', cleared_at: '2026-09-05T00:00:00Z' },
      { id: 'a3', click_id: 'c3', order_id: 'o3', commission_rate: 0.03, commission_amount: 50, status: 'reversed', created_at: '2026-09-03T00:00:00Z', cleared_at: null },
      { id: 'a4', click_id: 'c4', order_id: 'o4', commission_rate: 0.03, commission_amount: 40, status: 'rejected', created_at: '2026-09-04T00:00:00Z', cleared_at: null },
    ];
    const stats = await getAffiliateStats(makeService(attributions), 'user-1');
    expect(stats.totals.totalEarnings).toBe(30);
    expect(stats.totals.pendingEarnings).toBe(10);
  });

  it('byProduct: counts reversedReferrals separately from referrals/earnings, reusing the same attribution rows (no new query)', async () => {
    const attributions: Attribution[] = [
      { id: 'a1', click_id: 'c1', order_id: 'o1', commission_rate: 0.03, commission_amount: 10, status: 'confirmed', created_at: '2026-09-01T00:00:00Z', cleared_at: null },
      { id: 'a2', click_id: 'c2', order_id: 'o2', commission_rate: 0.03, commission_amount: 20, status: 'reversed', created_at: '2026-09-02T00:00:00Z', cleared_at: null },
      { id: 'a3', click_id: 'c3', order_id: 'o3', commission_rate: 0.03, commission_amount: 30, status: 'reversed', created_at: '2026-09-03T00:00:00Z', cleared_at: null },
      { id: 'a4', click_id: 'c4', order_id: 'o4', commission_rate: 0.03, commission_amount: 40, status: 'rejected', created_at: '2026-09-04T00:00:00Z', cleared_at: null },
    ];
    mocks.resolveProductNames.mockResolvedValue(new Map([['p1', 'Product One']]));
    const service = makeService(attributions, { c1: 'p1', c2: 'p1', c3: 'p1', c4: 'p1' });

    const stats = await getAffiliateStats(service, 'user-1');

    expect(stats.byProduct).toHaveLength(1);
    expect(stats.byProduct[0]).toMatchObject({ productId: 'p1', referrals: 1, earnings: 10, reversedReferrals: 2 });
  });

  it('is 0 when there is no affiliate link at all', async () => {
    const service = {
      from: (table: string) =>
        table === 'affiliate_links'
          ? { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }
          : { select: () => ({ eq: () => Promise.resolve({ data: [] }) }) },
    } as unknown as SupabaseClient;
    const stats = await getAffiliateStats(service, 'user-2');
    expect(stats.totals.totalEarnings).toBe(0);
  });
});
