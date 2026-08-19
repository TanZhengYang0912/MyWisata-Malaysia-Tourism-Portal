import { describe, expect, it } from 'vitest';
import { activityToMapPlace, slugifyState } from '@/lib/demo-map/adapt';
import type { ComputedActivity } from '@/backend/core/types';

describe('slugifyState', () => {
  it('slugifies a single-word state', () => {
    expect(slugifyState('Kedah')).toBe('kedah');
  });

  it('slugifies a two-word state to a dashed id matching DEMO_STATES', () => {
    expect(slugifyState('Kuala Lumpur')).toBe('kuala-lumpur');
    expect(slugifyState('Negeri Sembilan')).toBe('negeri-sembilan');
  });

  it('slugifies Borneo states', () => {
    expect(slugifyState('Sabah')).toBe('sabah');
    expect(slugifyState('Sarawak')).toBe('sarawak');
    expect(slugifyState('Labuan')).toBe('labuan');
  });
});

describe('activityToMapPlace', () => {
  const activity: ComputedActivity = {
    id: 'act-1',
    outletId: 'outlet-1',
    name: 'Heritage Street Food Trail',
    category: 'Food & Dining',
    description: 'A food trail',
    image: 'img.jpg',
    price: 68,
    rating: 4.8,
    reviews: 120,
    duration: '2 hours',
    requiresBooking: true,
    variants: [],
    outlet: {
      id: 'outlet-1',
      vendorId: 'vendor-1',
      name: 'Rasa Malaysia — Georgetown',
      category: 'food',
      state: 'Penang',
      city: 'George Town',
      address: '1 Street',
      lat: 5.4141,
      lng: 100.3288,
      hours: '9-5',
      verified: true,
      open: true,
      rating: 4.8,
      reviews: 120,
    },
    distanceKm: 3.2,
  };

  it('maps a ComputedActivity to a MapPlace with a slugified stateId', () => {
    const place = activityToMapPlace(activity);
    expect(place).toEqual({
      id: 'act-1',
      name: 'Heritage Street Food Trail',
      stateId: 'penang',
      lat: 5.4141,
      lng: 100.3288,
      category: 'Food & Dining',
      city: 'George Town',
      rating: 4.8,
      reviews: 120,
      price: 68,
      distanceKm: 3.2,
    });
  });

  it('leaves distanceKm undefined when the source activity has none', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { distanceKm: _unused, ...withoutDistance } = activity;
    const place = activityToMapPlace(withoutDistance as ComputedActivity);
    expect(place.distanceKm).toBeUndefined();
  });
});
