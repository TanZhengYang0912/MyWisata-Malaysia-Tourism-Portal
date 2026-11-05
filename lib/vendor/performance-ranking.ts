import type { DashboardFilter } from '@/lib/vendor-dashboard';

const FILTER_LABELS: Record<DashboardFilter, string> = {
  today: 'Today',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '12m': 'Last 12 months',
  custom: 'Custom range',
};

export function dashboardFilterLabel(filter: DashboardFilter) {
  return FILTER_LABELS[filter];
}

export function rankingPercent(value: number, leader: number) {
  if (leader <= 0 || value <= 0) return value === leader && leader > 0 ? 100 : 8;
  return Math.min(100, Math.max(8, Math.round((value / leader) * 100)));
}

export function formatAnalyticsTrendBucket(key: string, granularity: 'week' | 'month', locale: string): string {
  const date = new Date(granularity === 'month' ? `${key}-01T00:00:00+08:00` : `${key}T00:00:00+08:00`);
  return new Intl.DateTimeFormat(locale, granularity === 'month'
    ? { timeZone: 'Asia/Kuala_Lumpur', month: 'short', year: '2-digit' }
    : { timeZone: 'Asia/Kuala_Lumpur', day: 'numeric', month: 'short' }).format(date);
}
