import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: 'en' } }) }));
vi.mock('@/lib/i18n/server', () => ({ getServerTranslation: async () => ({ t: (key: string) => key, locale: 'en' }) }));
import SalesChart from '@/components/vendor/sales-chart';
import OutletPieChart from '@/components/vendor/outlet-pie-chart';
import PerformanceRankingCard from '@/components/vendor/performance-ranking-card';

describe('dashboard sales scope labels', () => {
  it('labels demo charts and their empty state without calling them live sales', () => {
    const markup = renderToStaticMarkup(<SalesChart data={[]} salesMode="demo" />);
    expect(markup).toContain('ui.dashboard.salesMode.demo');
    expect(markup).toContain('charts.sales.demoDescription');
    expect(markup).toContain('charts.sales.noDemoActivity');
    expect(markup).not.toContain('charts.sales.livePerformance');
  });

  it('labels demo product totals and empty distribution as simulated sales', () => {
    const markup = renderToStaticMarkup(<OutletPieChart data={[]} total={0} salesMode="demo" />);
    expect(markup).toContain('charts.sales.demoDescription');
    expect(markup).toContain('charts.sales.noDemoActivity');
    expect(markup).toContain('ui.dashboard.demoRevenue');
    expect(markup).not.toContain('charts.product.totalPaidRevenue');
  });

  it('labels the selling ranking as demo and keeps review rankings review-based', async () => {
    const selling = renderToStaticMarkup(await PerformanceRankingCard({ kind: 'selling', periodLabel: '30 days', items: [], href: '/vendor/products', salesMode: 'demo' }));
    expect(selling).toContain('ui.dashboard.salesMode.demo');
    const rated = renderToStaticMarkup(await PerformanceRankingCard({ kind: 'rated', periodLabel: '30 days', items: [], href: '/vendor/analytics', salesMode: 'demo' }));
    expect(rated).toContain('ranking.rated.eyebrow');
    expect(rated).not.toContain('ui.dashboard.salesMode.demo');
  });
});
