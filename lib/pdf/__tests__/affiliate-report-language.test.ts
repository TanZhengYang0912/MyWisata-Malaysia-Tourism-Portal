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

describe('affiliate report PDF locale', () => {
  it.each(['en', 'zh-CN', 'ms'] as const)('renders a report and selects local fonts for %s', async (locale) => {
    const bytes = await generateAffiliateReportPdf(data, locale);
    const pdf = bytes.toString('latin1');
    expect(pdf).toContain('%PDF');
    if (locale === 'zh-CN') {
      expect(pdf).toContain('NotoSansCJKsc-Regular');
      expect(pdf).toContain('/ToUnicode');
    } else {
      expect(pdf).not.toContain('NotoSansCJKsc-Regular');
    }
    if (process.env.AFFILIATE_REPORT_SAMPLE_DIR) {
      mkdirSync(process.env.AFFILIATE_REPORT_SAMPLE_DIR, { recursive: true });
      writeFileSync(path.join(process.env.AFFILIATE_REPORT_SAMPLE_DIR, `affiliate-${locale}.pdf`), bytes);
    }
  });
});
