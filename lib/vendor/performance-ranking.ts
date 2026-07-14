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
