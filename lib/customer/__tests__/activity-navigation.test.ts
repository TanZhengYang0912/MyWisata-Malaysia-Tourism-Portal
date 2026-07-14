import { describe, expect, it } from 'vitest';
import {
  activityHref,
  isActivityHistory,
  parseActivityTab,
} from '@/lib/customer/activity-navigation';

describe('customer activity navigation', () => {
  it('defaults to the itinerary tab', () => {
    expect(parseActivityTab(null)).toBe('itinerary');
    expect(parseActivityTab('unknown')).toBe('itinerary');
  });

  it('recognizes the orders tab and explicit history mode', () => {
    expect(parseActivityTab('orders')).toBe('orders');
    expect(isActivityHistory('true')).toBe(true);
    expect(isActivityHistory(null)).toBe(false);
  });

  it('builds stable links for each activity view', () => {
    expect(activityHref('itinerary')).toBe('/customer/activity?tab=itinerary');
    expect(activityHref('itinerary', true)).toBe('/customer/activity?tab=itinerary&history=true');
    expect(activityHref('orders')).toBe('/customer/activity?tab=orders');
  });
});
