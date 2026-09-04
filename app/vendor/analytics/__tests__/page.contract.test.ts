import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'app/vendor/analytics/page.tsx'), 'utf8');

describe('vendor analytics page contract', () => {
  it('uses the dedicated analytics data source and workspace', () => {
    expect(source).toContain('getVendorAnalyticsData');
    expect(source).toContain('VendorAnalyticsWorkspace');
    expect(source).not.toContain("from '@/components/vendor/sales-chart'");
    expect(source).not.toContain("from '@/components/vendor/outlet-pie-chart'");
  });

  it('exposes decision-support sections rather than dashboard summaries', () => {
    const workspace = readFileSync(resolve(process.cwd(), 'components/vendor/vendor-analytics-workspace.tsx'), 'utf8');

    for (const key of [
      'demandHeatmap',
      'revenueQuality',
      'productPortfolio',
      'outletPerformance',
      'customerSignal',
      'actionQueue',
      'marketingAttribution',
    ]) {
      expect(workspace).toContain(`analytics.${key}`);
    }
  });
});
