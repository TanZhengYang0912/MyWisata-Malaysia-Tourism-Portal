import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'app/vendor/analytics/page.tsx'), 'utf8');
const workspace = readFileSync(resolve(process.cwd(), 'components/vendor/vendor-analytics-workspace.tsx'), 'utf8');

describe('vendor analytics page contract', () => {
  it('uses the dedicated analytics data source and workspace', () => {
    expect(source).toContain('getVendorAnalyticsData');
    expect(source).toContain('VendorAnalyticsWorkspace');
    expect(source).not.toContain("from '@/components/vendor/sales-chart'");
    expect(source).not.toContain("from '@/components/vendor/outlet-pie-chart'");
  });

  it('exposes decision-support sections rather than dashboard summaries', () => {
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

  it('shows the four KPI cards before filters and removes the navy summary panel', () => {
    const firstMetricCard = workspace.indexOf("label={t('ui.analytics.metrics.revenuePerOutlet')}");
    const desktopFilters = workspace.indexOf('id="analytics-filter-desktop"');
    const mobileFilters = workspace.indexOf('id="analytics-mobile-filters"');
    const detailedAnalytics = workspace.indexOf("ui.analytics.revenueQuality.eyebrow");

    expect(firstMetricCard).toBeGreaterThan(-1);
    expect(desktopFilters).toBeGreaterThan(firstMetricCard);
    expect(mobileFilters).toBeGreaterThan(firstMetricCard);
    expect(detailedAnalytics).toBeGreaterThan(desktopFilters);
    expect(detailedAnalytics).toBeGreaterThan(mobileFilters);
    expect(workspace).not.toContain('rounded-[1.75rem] bg-[#10164a] text-white shadow');
    expect(workspace).not.toContain('function InsightStat');
  });
});
