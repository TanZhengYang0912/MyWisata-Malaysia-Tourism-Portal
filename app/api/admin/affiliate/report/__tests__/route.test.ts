import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), isSuperAdmin: vi.fn(), createServiceClient: vi.fn(),
  getAffiliateAdminStats: vi.fn(), getFraudCounters: vi.fn(), getFraudAnalytics: vi.fn(),
  generateAffiliateReportPdf: vi.fn(), getRequestLocale: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => mocks.createServiceClient() }));
vi.mock('@/lib/affiliate/admin-guard', () => ({ isSuperAdmin: mocks.isSuperAdmin }));
vi.mock('@/lib/affiliate/admin-stats', () => ({ getAffiliateAdminAttributionPage: mocks.getAffiliateAdminStats, getAffiliateAdminStats: mocks.getAffiliateAdminStats }));
vi.mock('@/lib/affiliate/fraud', () => ({ getFraudCounters: mocks.getFraudCounters }));
vi.mock('@/lib/affiliate/fraud-analytics', () => ({ getFraudAnalytics: mocks.getFraudAnalytics }));
vi.mock('@/lib/pdf/affiliate-report', () => ({ generateAffiliateReportPdf: mocks.generateAffiliateReportPdf }));
vi.mock('@/lib/i18n/server', () => ({ getRequestLocale: mocks.getRequestLocale }));

import { GET } from '../route';

describe('affiliate report route locale', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestLocale.mockResolvedValue('ms');
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-id' } } });
    mocks.isSuperAdmin.mockResolvedValue(true);
    mocks.createServiceClient.mockReturnValue({});
    mocks.getAffiliateAdminStats.mockResolvedValue({
      generatedAt: '2026-10-30T00:00:00.000Z',
      totals: { totalAffiliates: 0, totalClicks: 0, totalReferrals: 0, totalCommission: 0 },
      tiers: [], topEarners: [], attributions: [], attributionTotalCount: 0,
      attributionHasMore: false, attributionNextCursor: null, attributionSnapshotCutoff: '2026-10-30T00:00:00.000Z',
    });
    mocks.getFraudCounters.mockResolvedValue({});
    mocks.getFraudAnalytics.mockResolvedValue({ range: '30d' });
    mocks.generateAffiliateReportPdf.mockResolvedValue(Buffer.from('%PDF-test'));
  });

  it('uses the request locale without changing the download contract', async () => {
    const response = await GET(new Request('https://example.test/api/admin/affiliate/report?range=7d'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(mocks.generateAffiliateReportPdf).toHaveBeenCalledWith(expect.objectContaining({ stats: expect.any(Object) }), 'ms');
  });
});
