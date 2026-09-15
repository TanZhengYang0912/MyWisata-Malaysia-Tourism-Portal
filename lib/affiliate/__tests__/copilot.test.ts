import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const mocks = vi.hoisted(() => ({
  getAffiliateStats: vi.fn(),
  createServiceClient: vi.fn(),
}));

vi.mock('../stats', () => ({ getAffiliateStats: mocks.getAffiliateStats }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: mocks.createServiceClient }));

const { getCopilotSignals } = await import('../copilot');

const BASE_STATS = {
  affiliateCode: 'AF-TEST01',
  totals: { clicks: 0, referrals: 0, pendingEarnings: 0, availableToWithdraw: 0, totalEarnings: 0 },
  byProduct: [] as Array<{ productId: string; productName: string; shares: number; clicks: number; referrals: number; earnings: number }>,
  byCampaign: [] as Array<{ campaign: string | null; clicks: number; referrals: number; earnings: number }>,
  clicksByDay: [],
  commissions: [],
  funnel: { shares: 0, clicks: 0, conversions: 0, shareToClickRate: null, clickToConversionRate: null, byPlatform: [], sourceTrackingActive: false },
  tier: { tierName: 'standard', rate: 0.03, referralCount: 0, nextTier: null, referralsToNext: null },
};

/** Mocks affiliate_clicks / affiliate_attributions / products / product_review_metrics for the platform-wide opportunity queries. */
function mockPlatformData(opts: {
  clicks?: Array<{ id: string; target_id: string }>;
  attributions?: Array<{ click_id: string; status: string }>;
  products?: Array<{ id: string; name: string }>;
  reviewMetrics?: Array<{ product_id: string; rating: number; reviews: number }>;
}) {
  mocks.createServiceClient.mockReturnValue({
    from: (table: string) => {
      if (table === 'affiliate_clicks') {
        return { select: () => ({ eq: () => Promise.resolve({ data: opts.clicks ?? [] }) }) };
      }
      if (table === 'affiliate_attributions') {
        return { select: () => ({ in: () => ({ in: () => Promise.resolve({ data: opts.attributions ?? [] }) }) }) };
      }
      if (table === 'products') {
        return { select: () => ({ in: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: opts.products ?? [] }) }) }) }) };
      }
      if (table === 'product_review_metrics') {
        return {
          select: () => ({
            gte: () => ({ gte: () => ({ order: () => ({ order: () => ({ limit: () => Promise.resolve({ data: opts.reviewMetrics ?? [] }) }) }) }) }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as unknown as SupabaseClient);
}

const anyService = {} as SupabaseClient;

describe('getCopilotSignals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports hasActivity=false and empty signals for a brand-new affiliate', async () => {
    mocks.getAffiliateStats.mockResolvedValue(BASE_STATS);
    mockPlatformData({});

    const signals = await getCopilotSignals(anyService, 'user-1');

    expect(signals.hasActivity).toBe(false);
    expect(signals.topConverting).toEqual([]);
    expect(signals.underperforming).toEqual([]);
    expect(signals.opportunities).toEqual([]);
  });

  it('ranks top-converting and underperforming listings correctly, applying the click floor', async () => {
    mocks.getAffiliateStats.mockResolvedValue({
      ...BASE_STATS,
      totals: { ...BASE_STATS.totals, clicks: 20 },
      byProduct: [
        { productId: 'p-strong', productName: 'Strong Converter', shares: 2, clicks: 10, referrals: 6, earnings: 60 },
        { productId: 'p-weak', productName: 'Weak Converter', shares: 1, clicks: 8, referrals: 0, earnings: 0 },
        { productId: 'p-below-floor', productName: 'Below Click Floor', shares: 1, clicks: 2, referrals: 2, earnings: 20 }, // 2 clicks < MIN_CLICKS_FOR_PERSONAL_SIGNAL(3) — must be excluded from both ranked lists
        { productId: 'p-mid', productName: 'Mid Converter', shares: 1, clicks: 5, referrals: 1, earnings: 10 },
      ],
    });
    mockPlatformData({});

    const signals = await getCopilotSignals(anyService, 'user-1');

    expect(signals.hasActivity).toBe(true);
    expect(signals.topConverting.map((p) => p.productId)).toEqual(['p-strong', 'p-mid']);
    expect(signals.topConverting[0].conversionRate).toBe(0.6);
    expect(signals.underperforming.map((p) => p.productId)).toEqual(['p-weak']);
    // Below the click floor never appears in either ranked list, even though its own rate (100%) or click count would otherwise qualify it.
    expect(signals.topConverting.some((p) => p.productId === 'p-below-floor')).toBe(false);
    expect(signals.underperforming.some((p) => p.productId === 'p-below-floor')).toBe(false);
  });

  it('refund risk: flags a listing only once BOTH the reversed-count and refund-rate floors clear', async () => {
    mocks.getAffiliateStats.mockResolvedValue({
      ...BASE_STATS,
      byProduct: [
        // 3 reversed of 4 total (75%) — clears both floors (>=2 reversed, >=30% rate).
        { productId: 'p-risky', productName: 'Sunset Catamaran Cruise', shares: 1, clicks: 6, referrals: 1, earnings: 0.3, reversedReferrals: 3 },
        // Only 1 reversed — below the MIN_REVERSED_FOR_REFUND_SIGNAL(2) count floor even though the rate (100%) would qualify.
        { productId: 'p-one-refund', productName: 'One Refund', shares: 1, clicks: 2, referrals: 0, earnings: 0, reversedReferrals: 1 },
        // 2 reversed of 10 total (20%) — clears the count floor but not the MIN_REFUND_RATE_FOR_SIGNAL(0.3) rate floor.
        { productId: 'p-low-rate', productName: 'Low Rate', shares: 1, clicks: 12, referrals: 8, earnings: 8, reversedReferrals: 2 },
        // No reversals at all — never flagged.
        { productId: 'p-clean', productName: 'Clean Listing', shares: 1, clicks: 5, referrals: 5, earnings: 5, reversedReferrals: 0 },
      ],
    });
    mockPlatformData({});

    const signals = await getCopilotSignals(anyService, 'user-1');

    expect(signals.refundRisk.map((r) => r.productId)).toEqual(['p-risky']);
    expect(signals.refundRisk[0].refundRate).toBeCloseTo(0.75);
    expect(signals.refundRisk[0].reversedReferrals).toBe(3);
  });

  it('opportunity query: ranks by real platform-wide conversion rate and excludes listings this affiliate already shared', async () => {
    mocks.getAffiliateStats.mockResolvedValue({
      ...BASE_STATS,
      byProduct: [{ productId: 'p-already-shared', productName: 'Already Shared', shares: 1, clicks: 5, referrals: 1, earnings: 10 }],
    });
    mockPlatformData({
      clicks: [
        // p-already-shared: 4 platform clicks, would otherwise rank #1 by conversion rate (100%) — must be excluded since this affiliate already shared it.
        { id: 'c1', target_id: 'p-already-shared' }, { id: 'c2', target_id: 'p-already-shared' }, { id: 'c3', target_id: 'p-already-shared' }, { id: 'c4', target_id: 'p-already-shared' },
        // p-high-convert: 4 clicks, 2 conversions = 50%
        { id: 'c5', target_id: 'p-high-convert' }, { id: 'c6', target_id: 'p-high-convert' }, { id: 'c7', target_id: 'p-high-convert' }, { id: 'c8', target_id: 'p-high-convert' },
        // p-low-convert: 5 clicks, 1 conversion = 20%
        { id: 'c9', target_id: 'p-low-convert' }, { id: 'c10', target_id: 'p-low-convert' }, { id: 'c11', target_id: 'p-low-convert' }, { id: 'c12', target_id: 'p-low-convert' }, { id: 'c13', target_id: 'p-low-convert' },
        // p-below-floor: 2 clicks only, below MIN_CLICKS_FOR_PLATFORM_SIGNAL(3) — must never appear regardless of conversion rate
        { id: 'c14', target_id: 'p-below-floor' }, { id: 'c15', target_id: 'p-below-floor' },
      ],
      attributions: [
        { click_id: 'c1', status: 'confirmed' }, { click_id: 'c2', status: 'confirmed' }, { click_id: 'c3', status: 'confirmed' }, { click_id: 'c4', status: 'confirmed' },
        { click_id: 'c5', status: 'confirmed' }, { click_id: 'c6', status: 'pending' },
        { click_id: 'c9', status: 'confirmed' },
        { click_id: 'c14', status: 'confirmed' }, { click_id: 'c15', status: 'confirmed' }, // 100% but below the click floor — must not surface
      ],
      products: [
        { id: 'p-high-convert', name: 'High Convert Listing' },
        { id: 'p-low-convert', name: 'Low Convert Listing' },
      ],
    });

    const signals = await getCopilotSignals(anyService, 'user-1');

    const productIds = signals.opportunities.map((o) => o.productId);
    expect(productIds).toContain('p-high-convert');
    expect(productIds).toContain('p-low-convert');
    expect(productIds).not.toContain('p-already-shared');
    expect(productIds).not.toContain('p-below-floor');
    // Ranked by conversion rate descending.
    expect(productIds.indexOf('p-high-convert')).toBeLessThan(productIds.indexOf('p-low-convert'));
    const highConvert = signals.opportunities.find((o) => o.productId === 'p-high-convert')!;
    expect(highConvert.reason).toBe('platform_conversion');
    expect(highConvert.platformConversionRate).toBe(0.5);
    expect(highConvert.platformClicks).toBe(4);
  });

  it('excludes a reversed/rejected attribution from the platform conversion count (not "converting")', async () => {
    mocks.getAffiliateStats.mockResolvedValue(BASE_STATS);
    mockPlatformData({
      clicks: [{ id: 'c1', target_id: 'p1' }, { id: 'c2', target_id: 'p1' }, { id: 'c3', target_id: 'p1' }],
      // A real `.in('status', ['pending','confirmed'])` query never returns a
      // 'reversed' row in the first place — the mock reflects that by simply
      // not including one, same as the real DB filter would produce.
      attributions: [],
      products: [{ id: 'p1', name: 'P1' }],
    });

    const signals = await getCopilotSignals(anyService, 'user-1');

    const p1 = signals.opportunities.find((o) => o.productId === 'p1');
    expect(p1?.platformConversionRate).toBe(0); // 0 real conversions counted, 3 clicks — a real, honest 0%, not omitted (3 clicks meets the floor)
  });

  it('drops a platform-leading product that is no longer active/approved rather than suggesting it', async () => {
    mocks.getAffiliateStats.mockResolvedValue(BASE_STATS);
    mockPlatformData({
      clicks: [{ id: 'c1', target_id: 'p-now-inactive' }, { id: 'c2', target_id: 'p-now-inactive' }, { id: 'c3', target_id: 'p-now-inactive' }],
      attributions: [{ click_id: 'c1', status: 'confirmed' }],
      products: [], // the products query's own status='active'/review_status='approved' filter excluded it
    });

    const signals = await getCopilotSignals(anyService, 'user-1');

    expect(signals.opportunities).toEqual([]);
  });

  it('falls back to highly-rated listings when platform conversion data is too thin to fill the cap', async () => {
    mocks.getAffiliateStats.mockResolvedValue(BASE_STATS);
    mockPlatformData({
      clicks: [], // no platform click data at all yet
      reviewMetrics: [
        { product_id: 'p-rated-1', rating: 4.8, reviews: 20 },
        { product_id: 'p-rated-2', rating: 4.2, reviews: 5 },
      ],
      products: [
        { id: 'p-rated-1', name: 'Top Rated Listing' },
        { id: 'p-rated-2', name: 'Well Rated Listing' },
      ],
    });

    const signals = await getCopilotSignals(anyService, 'user-1');

    expect(signals.opportunities).toHaveLength(2);
    expect(signals.opportunities[0]).toMatchObject({ productId: 'p-rated-1', reason: 'highly_rated', rating: 4.8, reviewCount: 20 });
  });
});
