import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const mocks = vi.hoisted(() => ({
  getActiveTiers: vi.fn(),
  resolveProductNames: vi.fn(),
}));

vi.mock('../tier', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../tier')>();
  return { ...actual, getActiveTiers: mocks.getActiveTiers };
});
vi.mock('../product-names', () => ({ resolveProductNames: mocks.resolveProductNames }));

const { getAffiliateAdminStats } = await import('../admin-stats');

const TIERS = [
  { id: 't1', tierName: 'standard', rate: 0.03, minReferrals: 0, minSalesAmountSen: 0, activePeriodDays: null, maxFraudRatePercent: null },
  { id: 't2', tierName: 'active', rate: 0.04, minReferrals: 4, minSalesAmountSen: 50000, activePeriodDays: 90, maxFraudRatePercent: 20 },
  { id: 't3', tierName: 'top', rate: 0.05, minReferrals: 8, minSalesAmountSen: 200000, activePeriodDays: 60, maxFraudRatePercent: 10 },
];

function buildFixture() {
  const links = [{ id: 'link-1', user_id: 'user-1', affiliate_code: 'AF-TOP01', is_active: true }];
  const clicks = Array.from({ length: 10 }, (_, i) => ({
    id: `c${i + 1}`, link_id: 'link-1', target_type: 'product', target_id: 'p1', ip_hash: `h${i}`, source: null, created_at: '2026-09-01T00:00:00Z',
  }));
  const now = new Date().toISOString();
  // 9 confirmed attributions -> meets top's minReferrals (8) and sales bar; only the fraud rate should block top.
  const attributions = Array.from({ length: 9 }, (_, i) => ({
    id: `a${i + 1}`, click_id: `c${i + 1}`, order_id: `o${i + 1}`, commission_amount: 30, status: 'confirmed', created_at: now,
  }));
  const orders = Array.from({ length: 9 }, (_, i) => ({ id: `o${i + 1}`, total_amount: 1000 })); // RM1000 each -> RM9000 total, well over top's RM2000 bar
  const fraudFlags = [
    { link_id: 'link-1', status: 'open' },
    { link_id: 'link-1', status: 'open' },
  ]; // 2 of 10 clicks -> 20% fraud rate: fails top's 10% cap, passes active's 20% cap exactly
  return { links, clicks, attributions, orders, fraudFlags };
}

function makeService(fixture: ReturnType<typeof buildFixture>): SupabaseClient {
  return {
    from: (table: string) => {
      if (table === 'affiliate_links') return { select: () => Promise.resolve({ data: fixture.links }) };
      if (table === 'affiliate_clicks') return { select: () => Promise.resolve({ data: fixture.clicks }) };
      if (table === 'affiliate_attributions') return { select: () => Promise.resolve({ data: fixture.attributions }) };
      if (table === 'share_events') return { select: () => Promise.resolve({ data: [] }) };
      if (table === 'affiliate_fraud_flags') return { select: () => ({ neq: () => Promise.resolve({ data: fixture.fraudFlags }) }) };
      if (table === 'users') return { select: () => ({ in: () => Promise.resolve({ data: [{ id: 'user-1', full_name: 'Top Affiliate', email: 'top@example.com' }] }) }) };
      if (table === 'orders') return { select: () => ({ in: () => Promise.resolve({ data: fixture.orders }) }) };
      throw new Error(`unexpected table ${table}`);
    },
  } as unknown as SupabaseClient;
}

describe('getAffiliateAdminStats — tier resolution with all 4 signals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActiveTiers.mockResolvedValue(TIERS);
    mocks.resolveProductNames.mockResolvedValue(new Map());
  });

  it('caps a high-volume affiliate at active when their fraud rate exceeds top\'s cap', async () => {
    const stats = await getAffiliateAdminStats(makeService(buildFixture()));
    expect(stats.topEarners).toHaveLength(1);
    expect(stats.topEarners[0].tierName).toBe('active');
  });

  it('reaches top once the fraud rate drops below the cap, same volume otherwise', async () => {
    const fixture = buildFixture();
    fixture.fraudFlags = []; // 0% fraud rate now
    const stats = await getAffiliateAdminStats(makeService(fixture));
    expect(stats.topEarners[0].tierName).toBe('top');
  });
});
