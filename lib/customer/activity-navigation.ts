export type ActivityTab = 'itinerary' | 'orders';

export function parseActivityTab(value: string | null | undefined): ActivityTab {
  return value === 'orders' ? 'orders' : 'itinerary';
}

export function isActivityHistory(value: string | null | undefined): boolean {
  return value === 'true';
}

export function activityHref(tab: ActivityTab, history = false): string {
  const params = new URLSearchParams({ tab });
  if (tab === 'itinerary' && history) params.set('history', 'true');
  return `/customer/activity?${params.toString()}`;
}
