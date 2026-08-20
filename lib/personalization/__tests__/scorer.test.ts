import { describe, expect, it } from 'vitest';
import { rankPersonalizedActivities } from '@/lib/personalization/scorer';
import type { ComputedActivity } from '@/backend/core/types';

const activity = (id: string, overrides: Partial<ComputedActivity> = {}): ComputedActivity => ({
  id,
  outletId: 'outlet-1',
  name: id,
  category: 'Food & Dining',
  description: 'A public activity description',
  image: '/image.jpg',
  price: 50,
  rating: 4.5,
  reviews: 10,
  duration: '2 hours',
  requiresBooking: false,
  variants: [],
  tags: [],
  outlet: { id: 'outlet-1', vendorId: 'vendor-1', name: 'Outlet', category: 'Food & Dining', state: 'Kuala Lumpur', city: 'Kuala Lumpur', address: 'Public address', lat: 3.1, lng: 101.6, hours: 'Daily', verified: true, open: true, rating: 4.5, reviews: 10 },
  ...overrides,
});

describe('rankPersonalizedActivities', () => {
  it('ranks an activity tagged with the selected interest above unrelated activities', () => {
    const ranked = rankPersonalizedActivities([
      activity('museum', { category: 'Heritage & Culture' }),
      activity('food-tour', { tags: ['food'] }),
    ], { interests: ['food'], budgetRange: 'budget', mobilityNeeds: 'none', preferredRadiusKm: 0 });

    expect(ranked[0]?.activity.id).toBe('food-tour');
  });

  it('excludes activity outside a finite preferred distance when a distance is known', () => {
    const ranked = rankPersonalizedActivities([
      activity('nearby', { distanceKm: 0.8 }),
      activity('far-away', { distanceKm: 8 }),
    ], { interests: [], budgetRange: 'budget', mobilityNeeds: 'none', preferredRadiusKm: 1 });

    expect(ranked.map((item) => item.activity.id)).toEqual(['nearby']);
  });

  it('treats a zero preferred radius as any distance', () => {
    const ranked = rankPersonalizedActivities([
      activity('nearby', { distanceKm: 0.8 }),
      activity('far-away', { distanceKm: 80 }),
    ], { interests: [], budgetRange: 'budget', mobilityNeeds: 'none', preferredRadiusKm: 0 });

    expect(ranked).toHaveLength(2);
  });

  it('scores activities carrying a selected mobility tag', () => {
    const ranked = rankPersonalizedActivities([
      activity('plain'),
      activity('accessible', { tags: ['wheelchair accessible'] }),
    ], { interests: [], budgetRange: 'budget', mobilityNeeds: 'wheelchair', preferredRadiusKm: 0 });

    expect(ranked[0]?.activity.id).toBe('accessible');
  });
});
