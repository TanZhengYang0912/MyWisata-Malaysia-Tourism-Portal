import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateAffiliateReportPdf, type AffiliateReportData } from '@/lib/pdf/affiliate-report';

const data = {
  generatedAt: '2026-10-30T02:00:00.000Z',
  stats: {
    totals: { totalAffiliates: 0, totalClicks: 0, totalReferrals: 0, totalCommission: 0 },
    tiers: [], topEarners: [], attributions: [], attributionTotalCount: 0,
  },
  fraudCounters: { selfReferralsBlocked: 0, duplicatePayoutsPrevented: 0, openFlags: 0, linksDisabled: 0 },
  fraudAnalytics: {
    range: '30d', byType: [], bySeverity: [], topFlaggedAffiliates: [], overTime: [],
    headline: { totalFlags: 0, selfReferralsBlocked: 0, duplicatePayoutsPrevented: 0, openFlags: 0, reviewedFlags: 0, dismissedFlags: 0, linksAutoDisabled: 0 },
  },
} as unknown as AffiliateReportData;

describe('affiliate report PDF', () => {
  it('renders an English report without the CJK font for Latin data', async () => {
    const bytes = await generateAffiliateReportPdf(data);
    const pdf = bytes.toString('latin1');
    expect(pdf).toContain('%PDF');
    expect(pdf).not.toContain('NotoSansCJKsc-Regular');
    if (process.env.AFFILIATE_REPORT_SAMPLE_DIR) {
      mkdirSync(process.env.AFFILIATE_REPORT_SAMPLE_DIR, { recursive: true });
      writeFileSync(path.join(process.env.AFFILIATE_REPORT_SAMPLE_DIR, 'affiliate.pdf'), bytes);
    }
  });

  it('still embeds the CJK font when an affiliate name is Chinese', async () => {
    const withChineseName = {
      ...data,
      stats: { ...data.stats, topEarners: [{ userId: 'u1', userName: '陈小明', affiliateCode: 'CHEN01', referrals: 1, commission: 5, tierName: 'bronze' }] },
    } as AffiliateReportData;
    const pdf = (await generateAffiliateReportPdf(withChineseName)).toString('latin1');
    expect(pdf).toContain('NotoSansCJKsc-Regular');
    expect(pdf).toContain('/ToUnicode');
  });
});
